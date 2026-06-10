import { describe, it, expect } from "vitest";

const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "";
const VOICE_ID = "cgSgspJ2msm6clMCkdW9"; // Jessica
const MODEL_ID = "eleven_multilingual_v2";

describe("ElevenLabs TTS Integration", () => {
  it("deve gerar áudio em português com a voz Jessica", async () => {
    expect(ELEVENLABS_API_KEY).toBeTruthy();

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: {
          "xi-api-key": ELEVENLABS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: "Olá! Eu sou a Alaju.",
          model_id: MODEL_ID,
          voice_settings: {
            stability: 0.5,
            similarity_boost: 0.75,
            style: 0.3,
            use_speaker_boost: true,
          },
        }),
      }
    );

    expect(res.ok).toBe(true);
    expect(res.status).toBe(200);

    const contentType = res.headers.get("content-type");
    expect(contentType).toContain("audio");

    const buffer = await res.arrayBuffer();
    expect(buffer.byteLength).toBeGreaterThan(1000); // áudio real tem mais de 1KB
  }, 15000);
});
