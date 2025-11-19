// test-forecast.js
const fetch = require('node-fetch');
async function test() {
  try {
    const url = `https://api.openweathermap.org/data/2.5/forecast?lat=40.7128&lon=-74.0060&appid=02696551d7d5bce6dc7039e212b4862e&units=imperial`;
    const response = await fetch(url);
    const data = await response.json();
    console.log('Response:', data);
  } catch (err) {
    console.error('Error:', err);
  }
}
test();