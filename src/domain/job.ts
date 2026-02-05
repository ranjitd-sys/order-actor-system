const worker = new Worker("./worker.ts");

worker.postMessage("hello");
worker.onmessage = event => {
  console.log(event.data);
};