let model;

document.addEventListener('DOMContentLoaded', async () => {
    const videoElement = document.getElementById('video');
    const canvasElement = document.getElementById('canvas');
    
    const modelName = "document";
    const loader = document.getElementById('loader');
 
    loader.style.display = 'block';
  
    await tf.setBackend('webgl');
    await tf.ready();
  
    model = await tf.loadGraphModel(`${window.location.href}${modelName}_web_model/model.json`, {
      onProgress: (fractions) => {
        loader.textContent = `Loading model... ${(fractions * 100).toFixed(2)}%`;
        console.log(loader.textContent);
      },
    });
  
    const dummyInput = tf.ones(model.inputs[0].shape);
    model.execute(dummyInput);
    tf.dispose(dummyInput);
  
    loader.style.display = 'none';
  });