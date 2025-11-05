#!/usr/bin/env node
// Optional STT WER calculator. Requires `vosk` and a model path in VOSK_MODEL.
const fs = require('fs');

async function main() {
  let vosk;
  try { vosk = require('vosk'); } catch {
    console.log('SKIP: vosk not available');
    process.exit(0);
  }
  const modelPath = process.env.VOSK_MODEL;
  const wavPath = process.argv[2];
  const expected = process.argv.slice(3).join(' ');
  if (!modelPath || !wavPath || !expected) {
    console.error('Usage: stt_wer.cjs <wav> <expected text> (VOSK_MODEL env required)');
    process.exit(2);
  }
  if (!fs.existsSync(modelPath)) {
    console.error('Model path not found:', modelPath);
    process.exit(2);
  }
  if (!fs.existsSync(wavPath)) {
    console.error('WAV path not found:', wavPath);
    process.exit(2);
  }
  vosk.setLogLevel(0);
  const model = new vosk.Model(modelPath);
  const wf = new (require('wav')).Reader();
  const stream = fs.createReadStream(wavPath).pipe(wf);
  const rec = new vosk.Recognizer({model, sampleRate: 16000});
  const chunks = [];
  wf.on('format', async () => {
    if (wf.format.sampleRate !== 16000 || wf.format.channels !== 1) {
      console.error('Expected mono 16kHz WAV'); process.exit(2);
    }
  });
  stream.on('data', (data) => { rec.acceptWaveform(data); });
  await new Promise((resolve) => stream.on('end', resolve));
  const result = rec.finalResult();
  const text = (JSON.parse(result).text || '').trim();
  const wer = computeWER(expected, text);
  console.log(JSON.stringify({ expected, text, wer }));
  rec.free(); model.free();
  if (wer > 0.35) process.exit(1);
}

function computeWER(ref, hyp) {
  const r = ref.split(/\s+/); const h = hyp.split(/\s+/);
  const d = Array.from({ length: r.length + 1 }, () => Array(h.length + 1).fill(0));
  for (let i = 0; i <= r.length; i++) d[i][0] = i;
  for (let j = 0; j <= h.length; j++) d[0][j] = j;
  for (let i = 1; i <= r.length; i++) {
    for (let j = 1; j <= h.length; j++) {
      const cost = r[i-1] === h[j-1] ? 0 : 1;
      d[i][j] = Math.min(d[i-1][j] + 1, d[i][j-1] + 1, d[i-1][j-1] + cost);
    }
  }
  return d[r.length][h.length] / Math.max(1, r.length);
}

main().catch((e) => { console.error(e); process.exit(2); });

