/*

>> kasperkamperman.com - 2018-04-18
>> kasperkamperman.com - 2020-05-17
>> https://www.kasperkamperman.com/blog/camera-template/

*/

var takeSnapshotUI = createClickFeedbackUI();

var video;
var model;
var modelSeg;
var takePhotoButton;
var toggleFullScreenButton;
var switchCameraButton;
var amountOfCameras = 0;
var currentFacingMode = 'environment';
var lastCanvasRender = {};

// this function counts the amount of video inputs
// it replaces DetectRTC that was previously implemented.
function deviceCount() {
  return new Promise(function (resolve) {
    var videoInCount = 0;

    navigator.mediaDevices
      .enumerateDevices()
      .then(function (devices) {
        devices.forEach(function (device) {
          if (device.kind === 'video') {
            device.kind = 'videoinput';
          }

          if (device.kind === 'videoinput') {
            videoInCount++;
            console.log('videocam: ' + device.label);
          }
        });

        resolve(videoInCount);
      })
      .catch(function (err) {
        console.log(err.name + ': ' + err.message);
        resolve(0);
      });
  });
}

document.addEventListener('DOMContentLoaded', async (event) => {
  // check if mediaDevices is supported
  if (
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia &&
    navigator.mediaDevices.enumerateDevices
  ) {

    const modelName = "document";
    const modelNameSeg = "segment";
    const loader = document.getElementById('loader');
 
    loader.style.display = 'block';
  
    await tf.setBackend('webgl');
    await tf.ready();

    model = {
      net: null,
      inputShape: [1, 0, 0, 3],
    };

    modelSeg = {
      net: null,
      inputShape: [1, 0, 0, 3],
    };
  
    var yolov8 = await tf.loadGraphModel(`${window.location.href}/${modelName}_web_model/model.json`, {
      onProgress: (fractions) => {
        loader.textContent = `Loading model... ${(fractions * 100).toFixed(2)}%`;
        console.log(loader.textContent);
      },
    });
  
    const dummyInput = tf.ones(yolov8.inputs[0].shape);
    const warmupResults = yolov8.execute(dummyInput);
    
    model.net = yolov8;
    model.inputShape = yolov8.inputs[0].shape;

    const yolov8seg = await tf.loadGraphModel(
      `${window.location.href}/${modelNameSeg}_web_model/model.json`,
      {
        onProgress: (fractions) => {
          loader.textContent = `Loading model... ${(fractions * 100).toFixed(2)}%`;
          console.log(loader.textContent);
        },
      }
    ); // load model

    // warming up model
    const dummyInputSeg = tf.randomUniform(yolov8seg.inputs[0].shape, 0, 1, "float32"); // random input
    const warmupResultsSeg = yolov8seg.execute(dummyInput);
    
    modelSeg.net = yolov8seg;
    modelSeg.inputShape = yolov8seg.inputs[0].shape;
    modelSeg.outputShape = warmupResultsSeg.map((e) => e.shape);

    tf.dispose([warmupResults, dummyInput, dummyInputSeg, warmupResultsSeg]);

    loader.style.display = 'none';

    // first we call getUserMedia to trigger permissions
    // we need this before deviceCount, otherwise Safari doesn't return all the cameras
    // we need to have the number in order to display the switch front/back button
    navigator.mediaDevices
      .getUserMedia({
        audio: false,
        video: true,
      })
      .then(function (stream) {
        stream.getTracks().forEach(function (track) {
          track.stop();
        });

        deviceCount().then(function (deviceCount) {
          amountOfCameras = deviceCount;

          // init the UI and the camera stream
          initCameraUI();
          initCameraStream();
        });
      })
      .catch(function (error) {
        //https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
        if (error === 'PermissionDeniedError') {
          alert('Permission denied. Please refresh and give permission.');
        }

        console.error('getUserMedia() error: ', error);
      });
  } else {
    alert(
      'Mobile camera is not supported by browser, or there is no camera detected/connected',
    );
  }
});

function initCameraUI() {
  video = document.getElementById('video');
  canvas = document.getElementById('canvas');

  video.addEventListener('loadedmetadata', () => {
    console.log(`Video width: ${video.videoWidth}`);
    console.log(`Video height: ${video.videoHeight}`);

    // canvas.width = video.videoWidth;
    // canvas.height = video.videoHeight;

  });

  takePhotoButton = document.getElementById('takePhotoButton');
  returnVideo = document.getElementById('returnVideo');
  toggleFullScreenButton = document.getElementById('toggleFullScreenButton');
  switchCameraButton = document.getElementById('switchCameraButton');

  // https://developer.mozilla.org/nl/docs/Web/HTML/Element/button
  // https://developer.mozilla.org/en-US/docs/Web/Accessibility/ARIA/ARIA_Techniques/Using_the_button_role

  takePhotoButton.addEventListener('click', function () {
    console.log("takePhotoButton click");
    takeSnapshotUI();
    takeSnapshot();
  });

  returnVideo.addEventListener('click', function () {
    console.log("returnVideo click");
    returnVideButton();
  });

  // -- fullscreen part

  function fullScreenChange() {
    if (screenfull.isFullscreen) {
      toggleFullScreenButton.setAttribute('aria-pressed', true);
    } else {
      toggleFullScreenButton.setAttribute('aria-pressed', false);
    }
  }

  if (screenfull.isEnabled) {
    screenfull.on('change', fullScreenChange);

    toggleFullScreenButton.style.display = 'block';

    // set init values
    fullScreenChange();

    toggleFullScreenButton.addEventListener('click', function () {
      screenfull.toggle(document.getElementById('container')).then(function () {
        console.log(
          'Fullscreen mode: ' +
            (screenfull.isFullscreen ? 'enabled' : 'disabled'),
        );
      });
    });
  } else {
    console.log("iOS doesn't support fullscreen (yet)");
  }

  // -- switch camera part
  if (amountOfCameras > 1) {
    switchCameraButton.style.display = 'block';

    switchCameraButton.addEventListener('click', function () {
      if (currentFacingMode === 'environment') currentFacingMode = 'user';
      else currentFacingMode = 'environment';

      initCameraStream();
    });
  }

  // Listen for orientation changes to make sure buttons stay at the side of the
  // physical (and virtual) buttons (opposite of camera) most of the layout change is done by CSS media queries
  // https://www.sitepoint.com/introducing-screen-orientation-api/
  // https://developer.mozilla.org/en-US/docs/Web/API/Screen/orientation
  window.addEventListener(
    'orientationchange',
    function () {
      // iOS doesn't have screen.orientation, so fallback to window.orientation.
      // screen.orientation will
      if (screen.orientation) angle = screen.orientation.angle;
      else angle = window.orientation;

      var guiControls = document.getElementById('gui_controls').classList;
      var vidContainer = document.getElementById('vid_container').classList;

      if (angle == 270 || angle == -90) {
        guiControls.add('left');
        vidContainer.add('left');
      } else {
        if (guiControls.contains('left')) guiControls.remove('left');
        if (vidContainer.contains('left')) vidContainer.remove('left');
      }

      //0   portrait-primary
      //180 portrait-secondary device is down under
      //90  landscape-primary  buttons at the right
      //270 landscape-secondary buttons at the left
    },
    false,
  );
}

// https://github.com/webrtc/samples/blob/gh-pages/src/content/devices/input-output/js/main.js
function initCameraStream() {
  // stop any active streams in the window
  if (window.stream) {
    window.stream.getTracks().forEach(function (track) {
      console.log(track);
      track.stop();
    });
  }

  // we ask for a square resolution, it will cropped on top (landscape)
  // or cropped at the sides (landscape)
  var size = 1280;

  var constraints = {
    audio: false,
    video: {
      width: { ideal: size },
      height: { ideal: size },
      //width: { min: 1024, ideal: window.innerWidth, max: 1920 },
      //height: { min: 776, ideal: window.innerHeight, max: 1080 },
      facingMode: currentFacingMode,
    },
  };

  navigator.mediaDevices
    .getUserMedia(constraints)
    .then(handleSuccess)
    .catch(handleError);

  function handleSuccess(stream) {
    window.stream = stream; // make stream available to browser console
    video.srcObject = stream;
    const videoElement = document.getElementById('video');
    detectVideo(video, model, document.getElementById('canvas'));

    if (constraints.video.facingMode) {
      if (constraints.video.facingMode === 'environment') {
        switchCameraButton.setAttribute('aria-pressed', true);
      } else {
        switchCameraButton.setAttribute('aria-pressed', false);
      }
    }

    const track = window.stream.getVideoTracks()[0];
    const settings = track.getSettings();
    str = JSON.stringify(settings, null, 4);
    console.log('settings ' + str);
  }

  function handleError(error) {
    console.error('getUserMedia() error: ', error);
  }
}

function returnVideButton() {
  const cont = document.getElementById("vid_container");
  const picture = document.getElementById("picture");
  const takePhotoButton = document.getElementById("takePhotoButton");
  const returnVideo = document.getElementById("returnVideo");

  cont.style.display = "block";
  picture.style.display = "none";
  takePhotoButton.style.display = "block";
  returnVideo.style.display = "none";
}

function takeSnapshot() {
  console.log("takeSnapshot");
  // if you'd like to show the canvas add it to the DOM
  var canvas = document.getElementById('renderPicture');
  var canvasPicture = document.getElementById('canvasPicture');

  // var width = video.videoWidth;
  // var height = video.videoHeight;
  if (!lastCanvasRender.x1) {
    alert("No object detected!");
    return;
  }

  var width = lastCanvasRender.width;
  var height = lastCanvasRender.height;

  canvas.width = width;
  canvas.height = height;

  // canvasPicture.width = width;
  // canvasPicture.height = height;

  context = canvas.getContext('2d');
  //context.drawImage(video, lastCanvasRender.x1, lastCanvasRender.y1, lastCanvasRender.width, lastCanvasRender.height);
  context.drawImage(video, lastCanvasRender.x1, lastCanvasRender.y1, width, height, 0, 0, width, height);
  
  detectPhoto(canvas, modelSeg, canvasPicture, () => {
  // detectFramePicture(canvas, modelSeg, canvasPicture, () => {
    const cont = document.getElementById("vid_container");
    const picture = document.getElementById("picture");
    const takePhotoButton = document.getElementById("takePhotoButton");
    const returnVideo = document.getElementById("returnVideo");

    cont.style.display = "none";
    picture.style.display = "block";
    takePhotoButton.style.display = "none";
    returnVideo.style.display = "block";
  });

  // polyfil if needed https://github.com/blueimp/JavaScript-Canvas-to-Blob

  // https://developers.google.com/web/fundamentals/primers/promises
  // https://stackoverflow.com/questions/42458849/access-blob-value-outside-of-canvas-toblob-async-function
  function getCanvasBlob(canvas) {
    return new Promise(function (resolve, reject) {
      canvas.toBlob(function (blob) {
        resolve(blob);
      }, 'image/jpeg');
    });
  }

  // some API's (like Azure Custom Vision) need a blob with image data
  getCanvasBlob(canvas).then(function (blob) {
    // do something with the image blob
    console.log(blob);
  });
}

// https://hackernoon.com/how-to-use-javascript-closures-with-confidence-85cd1f841a6b
// closure; store this in a variable and call the variable as function
// eg. var takeSnapshotUI = createClickFeedbackUI();
// takeSnapshotUI();

function createClickFeedbackUI() {
  // in order to give feedback that we actually pressed a button.
  // we trigger a almost black overlay
  var overlay = document.getElementById('video_overlay'); //.style.display;

  // sound feedback
  var sndClick = new Howl({ src: ['snd/click.mp3'] });

  var overlayVisibility = false;
  var timeOut = 80;

  function setFalseAgain() {
    overlayVisibility = false;
    overlay.style.display = 'none';
  }

  return function () {
    if (overlayVisibility == false) {
      sndClick.play();
      overlayVisibility = true;
      overlay.style.display = 'block';
      setTimeout(setFalseAgain, timeOut);
    }
  };
}

function calculateFPS() {
  frameCount++;
  if (!startTime) {
    startTime = Date.now();
  } else {
    endTime = Date.now();
    const duration = (endTime - startTime) / 1000; // Tiempo en segundos
    if (duration >= 1) {
      const fps = Math.round(frameCount / duration);
      // console.log(`FPS: ${fps}`);
      frameCount = 0;
      startTime = Date.now();
    }
  }
  requestAnimationFrame(calculateFPS);
}





const labels = [
  "document"
];

const numClass = labels.length;

let frameCount = 0;
let startTime, endTime;

/**
 * Preprocess image / frame before forwarded into the model
 * @param {HTMLVideoElement|HTMLImageElement} source
 * @param {Number} modelWidth
 * @param {Number} modelHeight
 * @returns input tensor, xRatio and yRatio
 */
const preprocess = (source, modelWidth, modelHeight) => {
  let xRatio, yRatio; // ratios for boxes

  const input = tf.tidy(() => {
    const img = tf.browser.fromPixels(source);

    // padding image to square => [n, m] to [n, n], n > m
    const [h, w] = img.shape.slice(0, 2); // get source width and height
    const maxSize = Math.max(w, h); // get max size
    const imgPadded = img.pad([
      [0, maxSize - h], // padding y [bottom only]
      [0, maxSize - w], // padding x [right only]
      [0, 0],
    ]);

    xRatio = maxSize / w; // update xRatio
    yRatio = maxSize / h; // update yRatio

    return tf.image
      .resizeBilinear(imgPadded, [modelWidth, modelHeight]) // resize frame
      .div(255.0) // normalize
      .expandDims(0); // add batch
  });

  return [input, xRatio, yRatio];
};

/**
 * Function run inference and do detection from source.
 * @param {HTMLImageElement|HTMLVideoElement} source
 * @param {tf.GraphModel} model loaded YOLOv8 tensorflow.js model
 * @param {HTMLCanvasElement} canvasRef canvas reference
 * @param {VoidFunction} callback function to run after detection process
 */
const detect = async (source, model, canvasRef, callback = () => {}) => {

  if (source.videoHeight == 0 || source.videoWidth == 0) {
    callback();
    return
  };

  const [modelWidth, modelHeight] = model.inputShape.slice(1, 3); // get model width and height

  // Obtén el backend actual
  const backend = tf.getBackend();
  // console.log(`Backend actual: ${backend}`);
  
  // Verifica si WebGL está disponible  
  // const isWebGLAvailable = await tf.backend().isWebGLBackend();
  // console.log(`WebGL disponible: ${isWebGLAvailable}`);

  const start = Date.now();

  tf.engine().startScope(); // start scoping tf engine
  const [input, xRatio, yRatio] = preprocess(source, modelWidth, modelHeight); // preprocess image

  const result = model.net.execute(input); // inference model

  const inferenceTime = normalizeTime(Date.now() - start);
  //console.log(inferenceTime);

  const divFrames = document.getElementById("frames");

  if (divFrames) divFrames.innerText = inferenceTime + ` Backend actual: ${backend}`;

  // res[0].print();
  // res[1].print();
  //const res = result[1];
  const res = result;
  // console.log(res);
  const transRes = res.transpose([0, 2, 1]); // transpose result [b, det, n] => [b, n, det]
  const boxes = tf.tidy(() => {
    const w = transRes.slice([0, 0, 2], [-1, -1, 1]); // get width
    const h = transRes.slice([0, 0, 3], [-1, -1, 1]); // get height
    const x1 = tf.sub(transRes.slice([0, 0, 0], [-1, -1, 1]), tf.div(w, 2)); // x1
    const y1 = tf.sub(transRes.slice([0, 0, 1], [-1, -1, 1]), tf.div(h, 2)); // y1
    return tf
      .concat(
        [
          y1,
          x1,
          tf.add(y1, h), //y2
          tf.add(x1, w), //x2
        ],
        2
      )
      .squeeze();
  }); // process boxes [y1, x1, y2, x2]

  const [scores, classes] = tf.tidy(() => {
    // class scores
    const rawScores = transRes.slice([0, 0, 4], [-1, -1, numClass]).squeeze(0); // #6 only squeeze axis 0 to handle only 1 class models
    return [rawScores.max(1), rawScores.argMax(1)];
  }); // get max scores and classes index

  const nms = await tf.image.nonMaxSuppressionAsync(boxes, scores, 1, 0.25, 0.9); // NMS to filter boxes

  const boxes_data = boxes.gather(nms, 0).dataSync(); // indexing boxes by nms index
  const scores_data = scores.gather(nms, 0).dataSync(); // indexing scores by nms index
  const classes_data = classes.gather(nms, 0).dataSync(); // indexing classes by nms index

  // console.log("scores_data", scores_data);

  renderBoxes(canvasRef, boxes_data, scores_data, classes_data, [xRatio, yRatio]); // render boxes
  tf.dispose([res, transRes, boxes, scores, classes, nms]); // clear memory
  
  
  //tf.dispose([res]); // clear memory

  callback();

  tf.engine().endScope(); // end of scoping
};

/**
 * Function run inference and do detection from source.
 * @param {HTMLImageElement|HTMLVideoElement} source
 * @param {tf.GraphModel} model loaded YOLOv8 tensorflow.js model
 * @param {HTMLCanvasElement} canvasRef canvas reference
 * @param {VoidFunction} callback function to run after detection process
 */
const detectPhoto = async (source, model, canvasRef, callback = () => {}) => {
  callback();
  return;
  // if (source.videoHeight == 0 || source.videoWidth == 0) {
  //   callback();
  //   return
  // };

  const [modelWidth, modelHeight] = model.inputShape.slice(1, 3); // get model width and height

  // Obtén el backend actual
  const backend = tf.getBackend();
  // console.log(`Backend actual: ${backend}`);
  
  // Verifica si WebGL está disponible  
  // const isWebGLAvailable = await tf.backend().isWebGLBackend();
  // console.log(`WebGL disponible: ${isWebGLAvailable}`);

  const start = Date.now();

  tf.engine().startScope(); // start scoping tf engine
  const [input, xRatio, yRatio] = preprocess(source, modelWidth, modelHeight); // preprocess image

  const result = model.net.execute(input); // inference model

  const inferenceTime = normalizeTime(Date.now() - start);
  //console.log(inferenceTime);

  const divFrames = document.getElementById("frames");

  if (divFrames) divFrames.innerText = inferenceTime + ` Backend actual: ${backend}`;

  // res[0].print();
  // res[1].print();
  //const res = result[1];
  const res = result;
  // console.log(res);
  const transRes = res.transpose([0, 2, 1]); // transpose result [b, det, n] => [b, n, det]
  const boxes = tf.tidy(() => {
    const w = transRes.slice([0, 0, 2], [-1, -1, 1]); // get width
    const h = transRes.slice([0, 0, 3], [-1, -1, 1]); // get height
    const x1 = tf.sub(transRes.slice([0, 0, 0], [-1, -1, 1]), tf.div(w, 2)); // x1
    const y1 = tf.sub(transRes.slice([0, 0, 1], [-1, -1, 1]), tf.div(h, 2)); // y1
    return tf
      .concat(
        [
          y1,
          x1,
          tf.add(y1, h), //y2
          tf.add(x1, w), //x2
        ],
        2
      )
      .squeeze();
  }); // process boxes [y1, x1, y2, x2]

  const [scores, classes] = tf.tidy(() => {
    // class scores
    const rawScores = transRes.slice([0, 0, 4], [-1, -1, numClass]).squeeze(0); // #6 only squeeze axis 0 to handle only 1 class models
    return [rawScores.max(1), rawScores.argMax(1)];
  }); // get max scores and classes index

  const nms = await tf.image.nonMaxSuppressionAsync(boxes, scores, 1, 0.25, 0.9); // NMS to filter boxes

  const boxes_data = boxes.gather(nms, 0).dataSync(); // indexing boxes by nms index
  const scores_data = scores.gather(nms, 0).dataSync(); // indexing scores by nms index
  const classes_data = classes.gather(nms, 0).dataSync(); // indexing classes by nms index

  // console.log("scores_data", scores_data);

  renderBoxes(canvasRef, boxes_data, scores_data, classes_data, [xRatio, yRatio]); // render boxes
  tf.dispose([res, transRes, boxes, scores, classes, nms]); // clear memory
  
  
  //tf.dispose([res]); // clear memory

  callback();

  tf.engine().endScope(); // end of scoping
};

/**
 * Function to detect video from every source.
 * @param {HTMLVideoElement} vidSource video source
 * @param {tf.GraphModel} model loaded YOLOv8 tensorflow.js model
 * @param {HTMLCanvasElement} canvasRef canvas reference
 */
const detectVideo = (vidSource, model, canvasRef) => {
  /**
   * Function to detect every frame from video
   */
  const detectFrame = async () => {
    if (vidSource.videoWidth === 0 && vidSource.srcObject === null) {
      const ctx = canvasRef.getContext("2d");
      ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); // clean canvas
      return; // handle if source is closed
    }

    detect(vidSource, model, canvasRef, () => {
      requestAnimationFrame(detectFrame); // get another frame
      //requestAnimationFrame(calculateFPS); // get another frame
    });
  };

  detectFrame(); // initialize to detect every frame
};

const normalizeTime = (time) => {
  if (time < 1000) return `${time} ms`;
  else if (time < 60000) return `${(time / 1000).toFixed(2)} S`;
  return `${(time / 60000).toFixed(2)} H`;
};


/**
 * Render prediction boxes
 * @param {HTMLCanvasElement} canvasRef canvas tag reference
 * @param {Array} boxes_data boxes array
 * @param {Array} scores_data scores array
 * @param {Array} classes_data class array
 * @param {Array[Number]} ratios boxes ratio [xRatio, yRatio]
 */
const renderBoxes = (canvasRef, boxes_data, scores_data, classes_data, ratios) => {
  const ctx = canvasRef.getContext("2d");
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); // clean canvas

  const colors = new Colors();

  // font configs
  const font = `${Math.max(
    Math.round(Math.max(ctx.canvas.width, ctx.canvas.height) / 40),
    14
  )}px Arial`;
  ctx.font = font;
  ctx.textBaseline = "top";


  for (let i = 0; i < scores_data.length; ++i) {
    // filter based on class threshold
    const klass = labels[classes_data[i]];
    const color = colors.get(classes_data[i]);
    const score = (scores_data[i] * 100).toFixed(1);

    // console.log("score", score)

    let [y1, x1, y2, x2] = boxes_data.slice(i * 4, (i + 1) * 4);
    x1 *= ratios[0];
    x2 *= ratios[0];
    y1 *= ratios[1];
    y2 *= ratios[1];
    const width = (x2) - x1;
    const height = (y2) - y1;

    lastCanvasRender.x1 = x1;
    lastCanvasRender.y1 = x1;
    lastCanvasRender.width = width;
    lastCanvasRender.height = height;

    // draw box.
    ctx.fillStyle = Colors.hexToRgba(color, 0.2);
    ctx.fillRect(x1, y1, width, height);

    // draw border box.
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(Math.min(ctx.canvas.width, ctx.canvas.height) / 200, 2.5);
    ctx.strokeRect(x1, y1, width, height);

    // Draw the label background.
    ctx.fillStyle = color;
    const textWidth = ctx.measureText(klass + " - " + score + "%").width;
    const textHeight = parseInt(font, 10); // base 10
    const yText = y1 - (textHeight + ctx.lineWidth);
    ctx.fillRect(
      x1 - 1,
      yText < 0 ? 0 : yText, // handle overflow label box
      textWidth + ctx.lineWidth,
      textHeight + ctx.lineWidth
    );

    // Draw labels
    ctx.fillStyle = "#ffffff";
    ctx.fillText(klass + " - " + score + "%", x1 - 1, yText < 0 ? 0 : yText);
  }
};

class Colors {
  // ultralytics color palette https://ultralytics.com/
  constructor() {
    this.palette = [
      "#FF701F",
      "#FF3838",
      "#FF9D97",
      "#FFB21D",
      "#CFD231",
      "#48F90A",
      "#92CC17",
      "#3DDB86",
      "#1A9334",
      "#00D4BB",
      "#2C99A8",
      "#00C2FF",
      "#344593",
      "#6473FF",
      "#0018EC",
      "#8438FF",
      "#520085",
      "#CB38FF",
      "#FF95C8",
      "#FF37C7",
    ];
    this.n = this.palette.length;
  }

  get = (i) => this.palette[Math.floor(i) % this.n];

  static hexToRgba = (hex, alpha) => {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result
      ? `rgba(${[parseInt(result[1], 16), parseInt(result[2], 16), parseInt(result[3], 16)].join(
          ", "
        )}, ${alpha})`
      : null;
  };
}




/**
 * Function to detect image.
 * @param {HTMLImageElement} source Source
 * @param {tf.GraphModel} model loaded YOLOv8 tensorflow.js model
 * @param {HTMLCanvasElement} canvasRef canvas reference
 * @param {VoidFunction} callback Callback function to run after detect frame is done
 */
const detectFramePicture = async (source, model, canvasRef, callback = () => {}) => {
  const [modelHeight, modelWidth] = model.inputShape.slice(1, 3); // get model width and height
  const [modelSegHeight, modelSegWidth, modelSegChannel] = model.outputShape[1].slice(1);

  tf.engine().startScope(); // start scoping tf engine

  const [input, xRatio, yRatio] = preprocess(source, modelWidth, modelHeight); // do preprocessing

  const res = model.net.execute(input); // execute model
  const transRes = tf.tidy(() => res[0].transpose([0, 2, 1]).squeeze()); // transpose main result
  const transSegMask = tf.tidy(() => res[1].transpose([0, 3, 1, 2]).squeeze()); // transpose segmentation mask result

  const boxes = tf.tidy(() => {
    const w = transRes.slice([0, 2], [-1, 1]);
    const h = transRes.slice([0, 3], [-1, 1]);
    const x1 = tf.sub(transRes.slice([0, 0], [-1, 1]), tf.div(w, 2)); //x1
    const y1 = tf.sub(transRes.slice([0, 1], [-1, 1]), tf.div(h, 2)); //y1
    return tf
      .concat(
        [
          y1,
          x1,
          tf.add(y1, h), //y2
          tf.add(x1, w), //x2
        ],
        1
      ) // [y1, x1, y2, x2]
      .squeeze(); // [n, 4]
  }); // get boxes [y1, x1, y2, x2]

  const [scores, classes] = tf.tidy(() => {
    const rawScores = transRes.slice([0, 4], [-1, numClass]).squeeze(); // [n, 1]
    return [rawScores.max(1), rawScores.argMax(1)];
  }); // get scores and classes

  const nms = await tf.image.nonMaxSuppressionAsync(boxes, scores, 500, 0.45, 0.2); // do nms to filter boxes
  const detReady = tf.tidy(() =>
    tf.concat(
      [
        boxes.gather(nms, 0),
        scores.gather(nms, 0).expandDims(1),
        classes.gather(nms, 0).expandDims(1),
      ],
      1 // axis
    )
  ); // indexing selected boxes, scores and classes from NMS result
  const masks = tf.tidy(() => {
    const sliced = transRes.slice([0, 4 + numClass], [-1, modelSegChannel]).squeeze(); // slice mask from every detection [m, mask_size]
    return sliced
      .gather(nms, 0) // get selected mask from NMS result
      .matMul(transSegMask.reshape([modelSegChannel, -1])) // matmul mask with segmentation mask result [n, mask_size] x [mask_size, h x w] => [n, h x w]
      .reshape([nms.shape[0], modelSegHeight, modelSegWidth]); // reshape back [n, h x w] => [n, h, w]
  }); // processing mask

  const toDraw = []; // list boxes to draw
  let overlay = tf.zeros([modelHeight, modelWidth, 4]); // initialize overlay to draw mask

  for (let i = 0; i < detReady.shape[0]; i++) {
    const rowData = detReady.slice([i, 0], [1, 6]); // get every first 6 element from every row
    let [y1, x1, y2, x2, score, label] = rowData.dataSync(); // [y1, x1, y2, x2, score, label]
    const color = colors.get(label); // get label color

    const downSampleBox = [
      Math.floor((y1 * modelSegHeight) / modelHeight), // y
      Math.floor((x1 * modelSegWidth) / modelWidth), // x
      Math.round(((y2 - y1) * modelSegHeight) / modelHeight), // h
      Math.round(((x2 - x1) * modelSegWidth) / modelWidth), // w
    ]; // downsampled box (box ratio at model output)
    const upSampleBox = [
      Math.floor(y1 * yRatio), // y
      Math.floor(x1 * xRatio), // x
      Math.round((y2 - y1) * yRatio), // h
      Math.round((x2 - x1) * xRatio), // w
    ]; // upsampled box (box ratio to draw)

    const proto = tf.tidy(() => {
      const sliced = masks.slice(
        [
          i,
          downSampleBox[0] >= 0 ? downSampleBox[0] : 0,
          downSampleBox[1] >= 0 ? downSampleBox[1] : 0,
        ],
        [
          1,
          downSampleBox[0] + downSampleBox[2] <= modelSegHeight
            ? downSampleBox[2]
            : modelSegHeight - downSampleBox[0],
          downSampleBox[1] + downSampleBox[3] <= modelSegWidth
            ? downSampleBox[3]
            : modelSegWidth - downSampleBox[1],
        ]
      ); // coordinate to slice mask from proto
      return sliced.squeeze().expandDims(-1); // sliced proto [h, w, 1]
    });
    const upsampleProto = tf.image.resizeBilinear(proto, [upSampleBox[2], upSampleBox[3]]); // resizing proto to drawing size
    const mask = tf.tidy(() => {
      const padded = upsampleProto.pad([
        [upSampleBox[0], modelHeight - (upSampleBox[0] + upSampleBox[2])],
        [upSampleBox[1], modelWidth - (upSampleBox[1] + upSampleBox[3])],
        [0, 0],
      ]); // padding proto to canvas size
      return padded.less(0.5); // make boolean mask from proto to indexing overlay
    }); // final boolean mask
    overlay = tf.tidy(() => {
      const newOverlay = overlay.where(mask, [...Colors.hexToRgba(color), 150]); // indexing overlay from mask with RGBA code
      overlay.dispose(); // dispose old overlay tensor (free memory)
      return newOverlay; // return new overlay
    }); // new overlay

    toDraw.push({
      box: upSampleBox,
      score: score,
      klass: label,
      label: labels[label],
      color: color,
    }); // push box information to draw later

    tf.dispose([rowData, proto, upsampleProto, mask]); // dispose unused tensor to free memory
  }

  const maskImg = new ImageData(
    new Uint8ClampedArray(await overlay.data()), // tensor to array
    modelHeight,
    modelWidth
  ); // create image data from mask overlay

  const ctx = canvasRef.getContext("2d");
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); // clean canvas
  ctx.putImageData(maskImg, 0, 0); // render overlay to canvas

  renderBoxesSeg(ctx, toDraw); // render boxes

  callback(); // run callback function

  tf.engine().endScope(); // end of scoping
};

const renderBoxesSeg = (ctx, boxesToDraw) => {
  // font configs
  const font = `${Math.max(
    Math.round(Math.max(ctx.canvas.width, ctx.canvas.height) / 40),
    14
  )}px Arial`;
  ctx.font = font;
  ctx.textBaseline = "top";

  boxesToDraw.forEach((e) => {
    // filter based on class threshold
    const score = (e.score * 100).toFixed(1);

    let [y1, x1, height, width] = e.box;

    // draw border box.
    ctx.strokeStyle = e.color;
    ctx.lineWidth = Math.max(Math.min(ctx.canvas.width, ctx.canvas.height) / 200, 2.5);
    ctx.strokeRect(x1, y1, width, height);

    // Draw the label background.
    ctx.fillStyle = e.color;
    const textWidth = ctx.measureText(e.label + " - " + score + "%").width;
    const textHeight = parseInt(font, 10); // base 10
    const yText = y1 - (textHeight + ctx.lineWidth);
    ctx.fillRect(
      x1 - 1,
      yText < 0 ? 0 : yText, // handle overflow label box
      textWidth + ctx.lineWidth,
      textHeight + ctx.lineWidth
    );

    // Draw labels
    ctx.fillStyle = "#ffffff";
    ctx.fillText(e.label + " - " + score + "%", x1 - 1, yText < 0 ? 0 : yText);
  });
};