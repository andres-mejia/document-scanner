importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs/dist/tf.min.js');
importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs-backend-webgl');

let model;

const labels = [
    "document"
];

const numClass = labels.length;

self.onmessage = async function (e) {

    console.log("postMessage", e);


    if (e.data.type === 'loadModel') {
        await tf.setBackend('webgl');
        await tf.ready();

        model = {
            net: null,
            inputShape: [1, 0, 0, 3],
        };

        var yolov8 = await tf.loadGraphModel(e.data.modelUrl, {
            onProgress: (fractions) => {
                loader.textContent = `Loading model... ${(fractions * 100).toFixed(2)}%`;
                console.log(loader.textContent);
            },
        });

        const dummyInput = tf.ones(yolov8.inputs[0].shape);
        const warmupResults = yolov8.execute(dummyInput);

        model.net = yolov8;
        model.inputShape = yolov8.inputs[0].shape;

        tf.dispose([warmupResults, dummyInput]);

        console.log("postMessage");

        self.postMessage({ type: 'modelLoaded' });
    } else if (e.data.type === 'inference') {
        if (!model) {
            self.postMessage({ type: 'error', message: 'Model not loaded' });
            return;
        }

        // const [modelWidth, modelHeight] = model.inputShape.slice(1, 3); // get model width and height

        // Obtén el backend actual
        const backend = tf.getBackend();
        // console.log(`Backend actual: ${backend}`);

        const start = Date.now();

        tf.engine().startScope(); // start scoping tf engine
        // const [input, xRatio, yRatio] = preprocess(e.data.source, modelWidth, modelHeight); // preprocess image

        const result = model.net.execute(e.data.source.input); // inference model

        const inferenceTime = normalizeTime(Date.now() - start);
        //console.log(inferenceTime);

        const divFrames = document.getElementById("frames");

        if (divFrames) divFrames.innerText = inferenceTime + ` Backend actual: ${backend}`;

        const res = result;
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

        //renderBoxes(canvasRef, boxes_data, scores_data, classes_data, [xRatio, yRatio]); // render boxes

        self.postMessage({
            type: 'inferenceResult', result: {
                boxes_data,
                scores_data,
                classes_data,
                ratios: [e.data.source.xRatio, e.data.source.yRatio]
            }
        });

        tf.dispose([res, transRes, boxes, scores, classes, nms]); // clear memory
        tf.engine().endScope(); // end of scoping
    }
};

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

const normalizeTime = (time) => {
    if (time < 1000) return `${time} ms`;
    else if (time < 60000) return `${(time / 1000).toFixed(2)} S`;
    return `${(time / 60000).toFixed(2)} H`;
};