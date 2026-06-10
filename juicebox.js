const fs = require("fs");

const RAW = fs.readFileSync("juicebox.json", "utf8");

const ids = [
  ...new Set(
    [...RAW.matchAll(/"id":\s*"([a-f0-9]+__\d+)"/g)]
      .map(x => x[1])
  )
];

console.log("FOUND IDS:", ids.length);

const TOKEN = "eyJhbGciOiJSUzI1NiIsImtpZCI6Ijc5OTRiNGYzMTU2MzJiMjk3NzAwNmQ5M2U5NGIyYWNiZTMwNWZlNDYiLCJ0eXAiOiJKV1QifQ.eyJuYW1lIjoiRmVyb3ogSmFkZ2FsIiwicGljdHVyZSI6Imh0dHBzOi8vbGgzLmdvb2dsZXVzZXJjb250ZW50LmNvbS9hL0FDZzhvY0pIX0dfb2U0eTl1UFJwVElYRERfeWw4SGF2bDd3T21saURkNHNzVXlSNE82VHNDZz1zOTYtYyIsImlzcyI6Imh0dHBzOi8vc2VjdXJldG9rZW4uZ29vZ2xlLmNvbS9qdWljZWJveC1haS1kZXYiLCJhdWQiOiJqdWljZWJveC1haS1kZXYiLCJhdXRoX3RpbWUiOjE3NzQzNzk2MjAsInVzZXJfaWQiOiJWQVBwWlVYdEpEWnJHaDM3VUFiM2xXQkNSWUQyIiwic3ViIjoiVkFQcFpVWHRKRFpyR2gzN1VBYjNsV0JDUllEMiIsImlhdCI6MTc4MTA5MzQwOCwiZXhwIjoxNzgxMDk3MDA4LCJlbWFpbCI6ImphZGdhbGZlcm96QGdtYWlsLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjp0cnVlLCJmaXJlYmFzZSI6eyJpZGVudGl0aWVzIjp7Imdvb2dsZS5jb20iOlsiMTA1NTA4MDk2NTMxMjM0ODM3MDg5Il0sImVtYWlsIjpbImphZGdhbGZlcm96QGdtYWlsLmNvbSJdfSwic2lnbl9pbl9wcm92aWRlciI6InBhc3N3b3JkIn19.RyB9QYppnpaZxrJuwFmNsBYoHievm2HMQ99iJDoylP7-_YCPWo028i0p0OcON6UBoPFDSy_3SWNTbLkRWLk_EcvXXjyAsMa8F49Jb_2w6EoyOIycgBvNTVoiQyHlkzHJQ4Fsx1wu7mT0ePIDPTBB9Dyx661GLUJYrbayNjbeQVVsAUdK-9VQfBaMhAnNfYUkF-dJB6H6UljVuGR3yqWf72aoOwe-9HEnq8xolu4JnBMgyBQnq3X1kZpJ2XrUZ5JdpuMm7C0x7PAx-mns1eG_-qnhc_FXCrPOtHGjNGx9sfxJPxhs0Q4w1ifM8nFDm527nrRLCdNrTxdGZtBKcyJLgA";

async function run() {

  const results = [];

  for (const id of ids) {

    try {

      const res = await fetch(
        `https://app.juicebox.ai/api/profile/external?searchResultId=${id}&networkType=linkedin`,
        {
          headers: {
            fbauthorization: TOKEN,
            accept: "application/json"
          }
        }
      );

      const json = await res.json();

      if (json.result) {

        const url =
          "https://" +
          json.result.replace(/^https?:\/\//, "");

        console.log(url);

        results.push(url);
      }

    } catch (e) {
      console.log("ERR", id);
    }

    await new Promise(r => setTimeout(r, 250));
  }

  fs.writeFileSync(
    "linkedins.txt",
    results.join("\n")
  );

  console.log("DONE", results.length);
}

run();