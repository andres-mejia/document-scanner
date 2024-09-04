self.importScripts('https://docs.opencv.org/4.x/opencv.js');
cv['onRuntimeInitialized'] = function() {
    console.log("OpenCV is loaded in the worker.");

    self.onmessage = function(event) {
        const { imageData, width, height } = event.data;

        if (!cv || !cv.Mat) {
            console.error("OpenCV is not loaded in the worker.");
            return;
        }

        // Reconstruir Uint8ClampedArray a partir del buffer
        const clampedArray = new Uint8ClampedArray(imageData);

        // Crear un Mat desde el buffer de datos de imagen
        let mat = cv.matFromImageData(new ImageData(clampedArray, width, height));
        let edges = new cv.Mat();

        // Convertir a escala de grises
        cv.cvtColor(mat, edges, cv.COLOR_RGBA2GRAY, 0);
        
        // Invertir los colores de los bordes detectados (opcional)
        cv.bitwise_not(edges, edges); // Esto invierte los colores (blanco en negro)


        // Aplicar Canny para detectar bordes
        cv.Canny(edges, edges, 50, 150); // Umbrales más bajos para probar la detección

        // Normalizar los valores de la imagen de bordes para que sean visibles
        cv.normalize(edges, edges, 0, 255, cv.NORM_MINMAX);

        console.log("Edges detected:", edges);


        // Convertir de nuevo a RGBA (canvas espera 4 canales por píxel)
        let result = new cv.Mat();
        cv.cvtColor(edges, result, cv.COLOR_GRAY2RGBA);

        // Retornar la imagen procesada en formato RGBA
        self.postMessage({
            resultImageData: result.data,
            width: result.cols,
            height: result.rows
        });

        // Liberar memoria
        mat.delete();
        edges.delete();
        result.delete();
    };
};
