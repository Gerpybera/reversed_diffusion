const COMFY_URL = "http://127.0.0.1:8188";

let currentController = null;
let currentWorkflowPath = null;
let workflowDropdownInitialized = false;
const workflowCache = new Map();

const workflowModules = import.meta.glob("./workflows/wildbreaker-SIMPLEV5.json");
const defaultWorkflowPath = Object.keys(workflowModules)[0] ?? null;

function setStatus(text) {
  const el = document.getElementById("status");
  if (el) el.textContent = text;
}

function ensureWorkflowDropdown(selectId = "workflow-select") {
  if (workflowDropdownInitialized) return;

  const select = document.getElementById(selectId);
  if (!select) {
    if (!currentWorkflowPath) {
      currentWorkflowPath = defaultWorkflowPath;
    }
    return;
  }

  const workflows = Object.keys(workflowModules)
    .map((path) => {
      const fileName = path.split("/").pop();
      return {
        path,
        name: fileName.replace(".json", ""),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

  select.innerHTML = "";

  workflows.forEach((workflow, index) => {
    const option = document.createElement("option");
    option.value = workflow.path;
    option.textContent = workflow.name;
    select.appendChild(option);

    if (index === 0) {
      currentWorkflowPath = workflow.path;
      select.value = workflow.path;
    }
  });

  select.addEventListener("change", () => {
    currentWorkflowPath = select.value;
    setStatus(
      `workflow: ${select.selectedOptions[0]?.textContent || "unknown"}`,
    );
  });

  workflowDropdownInitialized = true;

  if (workflows.length > 0) {
    setStatus(`workflow: ${workflows[0].name}`);
  } else {
    setStatus("no workflows found");
  }
}

initWorkflowDropdown();

export function initWorkflowDropdown(selectId = "workflow-select") {
  ensureWorkflowDropdown(selectId);
}

export function getCurrentWorkflowPath() {
  ensureWorkflowDropdown();
  if (!currentWorkflowPath) {
    currentWorkflowPath = defaultWorkflowPath;
  }
  return currentWorkflowPath;
}

export function cancelComfyRequest() {
  if (currentController) {
    currentController.abort();
    currentController = null;
  }
}

async function loadWorkflow(workflowPath) {
  if (!workflowPath) {
    throw new Error("no workflow selected");
  }

  if (workflowCache.has(workflowPath)) {
    return structuredClone(workflowCache.get(workflowPath));
  }

  const importer = workflowModules[workflowPath];
  if (!importer) {
    throw new Error(`workflow not found: ${workflowPath}`);
  }

  const mod = await importer();
  workflowCache.set(workflowPath, structuredClone(mod.default));
  return structuredClone(mod.default);
}

export async function preloadWorkflow() {
  ensureWorkflowDropdown();

  if (!currentWorkflowPath) {
    currentWorkflowPath = defaultWorkflowPath;
  }

  if (!currentWorkflowPath) {
    return {
      ok: false,
      error: "no workflow available",
    };
  }

  try {
    await loadWorkflow(currentWorkflowPath);
    setStatus(
      `workflow loaded: ${currentWorkflowPath.split("/").pop().replace(".json", "")}`,
    );
    return {
      ok: true,
      workflowPath: currentWorkflowPath,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message || String(error),
    };
  }
}

function extractBase64(dataUrl) {
  const parts = dataUrl.split(",");
  if (parts.length < 2) throw new Error("invalid dataUrl");
  return parts[1];
}

function ensureDataUrl(base64) {
  if (!base64 || typeof base64 !== "string") return null;
  if (base64.startsWith("data:image/")) return base64;
  return `data:image/png;base64,${base64}`;
}

function getWorkflowNodes(workflow) {
  return Object.values(workflow || {}).filter(
    (node) => node && typeof node === "object" && node.inputs,
  );
}

function applyWorkflowInputs(workflow, dataUrl, promptText, seed) {
  const nodes = getWorkflowNodes(workflow);

  const base64Nodes = nodes.filter((node) => "data" in node.inputs);
  for (const node of base64Nodes) {
    node.inputs.data = extractBase64(dataUrl);
  }

  if (base64Nodes.length === 0) {
    throw new Error(
      "selected workflow has no base64 image input node (expected an input named 'data')",
    );
  }

  // Prefer node 78 (jungle prompt), but fall back to other positive prompt nodes
  let textNode = null;
  
  if (workflow["78"] && workflow["78"].class_type === "CLIPTextEncode" && "text" in workflow["78"].inputs) {
    textNode = workflow["78"];
  } else {
    const clipTextNodes = Object.entries(workflow).filter(
      ([, node]) => node && node.class_type === "CLIPTextEncode" && "text" in node.inputs,
    );

    // Prefer likely positive prompt nodes and avoid obvious negative prompts.
    textNode = clipTextNodes.find(([, node]) => {
      const text = String(node.inputs.text || "").toLowerCase();
      return !/(watermark|blurry|deformed|ugly|low quality|negative)/.test(text);
    })?.[1];
  }

  if (textNode) {
    textNode.inputs.text = promptText;
  }

  for (const node of nodes) {
    if ("noise_seed" in node.inputs) {
      node.inputs.noise_seed = seed;
    }
    if ("seed" in node.inputs) {
      node.inputs.seed = seed;
    }
  }
}

function isLikelyBase64Image(value) {
  if (typeof value !== "string") {
    return false;
  }

  if (value.startsWith("data:image/")) {
    return true;
  }

  return value.length > 100 && /^[A-Za-z0-9+/=\r\n]+$/.test(value);
}

function findBase64InValue(value) {
  if (isLikelyBase64Image(value)) {
    return ensureDataUrl(value);
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findBase64InValue(item);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  if (value && typeof value === "object") {
    for (const nestedValue of Object.values(value)) {
      const nested = findBase64InValue(nestedValue);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function findBase64Output(history) {
  const outputs = history?.outputs || {};

  for (const nodeId of Object.keys(outputs)) {
    const value = outputs[nodeId];
    const dataUrl = findBase64InValue(value);
    if (dataUrl) {
      return dataUrl;
    }
  }

  return null;
}

function findImageDescriptorInValue(value) {
  if (!value) {
    return null;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = findImageDescriptorInValue(item);
      if (nested) {
        return nested;
      }
    }
    return null;
  }

  if (typeof value === "object") {
    if (
      typeof value.filename === "string" &&
      typeof value.type === "string"
    ) {
      return {
        filename: value.filename,
        subfolder: typeof value.subfolder === "string" ? value.subfolder : "",
        type: value.type,
      };
    }

    for (const nestedValue of Object.values(value)) {
      const nested = findImageDescriptorInValue(nestedValue);
      if (nested) {
        return nested;
      }
    }
  }

  return null;
}

function findImageDescriptorOutput(history) {
  const outputs = history?.outputs || {};

  for (const nodeId of Object.keys(outputs)) {
    const value = outputs[nodeId];
    const descriptor = findImageDescriptorInValue(value);
    if (descriptor) {
      return descriptor;
    }
  }

  return null;
}

async function imageDescriptorToDataUrl(descriptor, signal) {
  const params = new URLSearchParams({
    filename: descriptor.filename,
    subfolder: descriptor.subfolder || "",
    type: descriptor.type,
  });

  const res = await fetch(`${COMFY_URL}/view?${params.toString()}`, { signal });
  if (!res.ok) {
    throw new Error("failed to fetch image output");
  }

  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("failed to decode image output"));
    reader.readAsDataURL(blob);
  });
}

async function getBase64FromHistory(promptId, signal) {
  while (true) {
    if (signal.aborted) {
      throw new DOMException("Request aborted", "AbortError");
    }

    await new Promise((resolve) => setTimeout(resolve, 200));

    const res = await fetch(`${COMFY_URL}/history/${promptId}`, { signal });
    if (!res.ok) throw new Error("failed to fetch history");

    const json = await res.json();
    const history = json[promptId];

    if (!history) continue;

    const textOutput = findBase64Output(history);
    if (textOutput) return ensureDataUrl(textOutput);

    const imageDescriptor = findImageDescriptorOutput(history);
    if (imageDescriptor) {
      return await imageDescriptorToDataUrl(imageDescriptor, signal);
    }

    if (history?.status?.completed) return null;
  }
}

export async function runComfy(dataUrl, promptText, seed) {
  ensureWorkflowDropdown();

  if (!currentWorkflowPath) {
    currentWorkflowPath = defaultWorkflowPath;
  }

  if (!currentWorkflowPath) {
    return {
      ok: false,
      error: "no workflow available",
    };
  }

  cancelComfyRequest();
  currentController = new AbortController();
  const { signal } = currentController;

  try {
    const workflow = await loadWorkflow(currentWorkflowPath);

    setStatus(
      `running: ${currentWorkflowPath.split("/").pop().replace(".json", "")}...`,
    );

    applyWorkflowInputs(workflow, dataUrl, promptText, seed);

    const promptRes = await fetch(`${COMFY_URL}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prompt: workflow }),
      signal,
    });

    if (!promptRes.ok) {
      const text = await promptRes.text();
      throw new Error(`prompt failed: ${text}`);
    }

    const promptJson = await promptRes.json();
    const promptId = promptJson.prompt_id;

    const firstImage = await getBase64FromHistory(promptId, signal);

    if (currentController?.signal === signal) {
      currentController = null;
    }

    if (!firstImage) {
      setStatus("no output");
      return {
        ok: false,
        skipped: true,
        error: "no output",
      };
    }

    setStatus("done");

    return {
      ok: true,
      firstImage,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      return {
        ok: false,
        aborted: true,
        error: "aborted",
      };
    }

    setStatus("error");

    return {
      ok: false,
      error: error.message || String(error),
    };
  }
}
