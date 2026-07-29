# Wake Word Research — Alaju

## Melhor abordagem: OpenWakeWord + openwakeword-android-kt

### Biblioteca Android nativa
- **openwakeword-android-kt**: https://github.com/Re-MENTIA/openwakeword-android-kt
- Kotlin, Apache 2.0, Android SDK 23+
- Usa ONNX Runtime para inferência local
- Requer 3 arquivos em `assets/`: `alaju.onnx`, `melspectrogram.onnx`, `embedding_model.onnx`

### Integração React Native
- Não há binding nativo direto para Expo/React Native ainda
- Alternativa: **react-native-wakeword** (DaVoice) — MIT, mas modelos customizados precisam de contato
- Melhor abordagem: criar Native Module Android que usa openwakeword-android-kt

### Treinar modelo "Alaju"
- Site: https://openwakeword.com (gratuito)
- Ou Google Colab: https://colab.research.google.com/drive/1q1oe2zOyZp7UsB3jJiQ1IFn8z5YfjwEb
- Exportar como `.onnx`
- Também precisa de: `melspectrogram.onnx` e `embedding_model.onnx` do repo oficial openWakeWord

### Arquivos necessários do OpenWakeWord oficial
- melspectrogram.onnx: https://github.com/dscripka/openWakeWord/releases
- embedding_model.onnx: mesmo repo

### Limitação Expo
- Expo managed workflow NÃO suporta Native Modules customizados
- Precisaria usar **Expo Bare Workflow** ou **expo-modules** para criar módulo nativo
- Alternativa mais simples: detecção contínua via transcrição de voz (sem wake word nativa)
