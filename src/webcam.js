let webcamStream = null;
let webcamVideo = null;
let webcamPromise = null;

export async function initWebcam() {
  if (webcamStream) {
    return webcamStream;
  }

  if (webcamPromise) {
    return webcamPromise;
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    throw new Error("MediaDevices API not available");
  }

  webcamVideo = webcamVideo ?? document.createElement("video");
  webcamVideo.autoplay = true;
  webcamVideo.muted = true;
  webcamVideo.playsInline = true;

  webcamPromise = navigator.mediaDevices
    .getUserMedia({
      video: {
        facingMode: "user",
      },
      audio: false,
    })
    .then(async (stream) => {
      webcamStream = stream;
      webcamVideo.srcObject = stream;
      await webcamVideo.play();
      return stream;
    })
    .catch((error) => {
      webcamPromise = null;
      throw error;
    });

  return webcamPromise;
}

export function getWebcamVideo() {
  return webcamVideo;
}

export function isWebcamReady() {
  return Boolean(webcamStream && webcamVideo && webcamVideo.readyState >= 2);
}
