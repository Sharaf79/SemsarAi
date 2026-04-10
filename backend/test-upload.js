const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

async function run() {
  try {
    const form = new FormData();
    form.append('file', fs.createReadStream('test.jpg'));
    form.append('userId', '1234');
    form.append('type', 'IMAGE');

    const res = await axios.post('http://localhost:3000/onboarding/upload-file', form, {
      headers: form.getHeaders()
    });
    console.log("UPLOAD FILE:", res.data);

    // Call upload media
    const res2 = await axios.post('http://localhost:3000/onboarding/upload-media', {
      userId: '1234',
      url: res.data.data.url,
      type: 'IMAGE'
    });
    console.log("UPLOAD MEDIA:", res2.data);
  } catch (e) {
    if (e.response) {
      console.log("ERROR:", e.response.status, e.response.data);
    } else {
      console.log("ERROR:", e.message);
    }
  }
}
run();
