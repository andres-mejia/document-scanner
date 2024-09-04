self.importScripts('opencv.js'); // Carga OpenCV.js en el Web Worker

self.onmessage = function(event) {
    const { imageData, width, height } = event.data;

    // Convertir la imagen en un Mat
    let mat = cv.matFromImageData(new ImageData(new Uint8ClampedArray(imageData), width, height));
    let edges = new cv.Mat();

    // Convertir a escala de grises y detectar bordes
    cv.cvtColor(mat, edges, cv.COLOR_RGBA2GRAY);
    cv.Canny(edges, edges, 100, 200);

    // Codificar la imagen procesada
    const resultImageData = edges.data;
    self.postMessage({ resultImageData, width, height });

    // Liberar memoria
    mat.delete();
    edges.delete();
};
