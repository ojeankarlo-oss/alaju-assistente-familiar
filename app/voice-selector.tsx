import { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useAudioPlayer } from "expo-audio";
import * as FileSystem from "expo-file-system/legacy";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getSettings, saveSettings } from "@/lib/family-store";
import { trpc } from "@/lib/trpc";

interface Voice {
  voice_id: string;
  name: string;
  description: string;
  available: boolean;
}

const PREVIEW_TEXT = "Olá! Sou a Alaju, sua assistente familiar. Estou aqui para ajudar toda a família.";

export default function VoiceSelectorScreen() {
  const colors = useColors();
  const [voices, setVoices] = useState<Voice[]>([]);
  const [selectedVoiceId, setSelectedVoiceId] = useState("cgSgspJ2msm6clMCkdW9");
  const [selectedVoiceName, setSelectedVoiceName] = useState("Jessica");
  const [loadingVoices, setLoadingVoices] = useState(true);
  const [previewingId, setPreviewingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const audioPlayerRef = useRef<ReturnType<typeof useAudioPlayer> | null>(null);

  const listVoicesQuery = trpc.tts.listVoices.useQuery();
  const speakMutation = trpc.tts.speak.useMutation();

  useEffect(() => {
    getSettings().then((s) => {
      setSelectedVoiceId(s.selectedVoiceId || "cgSgspJ2msm6clMCkdW9");
      setSelectedVoiceName(s.selectedVoiceName || "Jessica");
    });
  }, []);

  useEffect(() => {
    if (listVoicesQuery.data) {
      setVoices(listVoicesQuery.data.voices as Voice[]);
      setLoadingVoices(false);
    }
    if (listVoicesQuery.error) {
      setLoadingVoices(false);
    }
  }, [listVoicesQuery.data, listVoicesQuery.error]);

  const playPreview = useCallback(async (voice: Voice) => {
    if ((Platform.OS as string) === "web") {
      Alert.alert("Prévia não disponível", "A prévia de voz funciona apenas no dispositivo móvel.");
      return;
    }
    if (previewingId === voice.voice_id) return;

    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setPreviewingId(voice.voice_id);

    try {
      const result = await speakMutation.mutateAsync({
        text: PREVIEW_TEXT,
        voiceId: voice.voice_id,
      });

      if (!result.base64) {
        Alert.alert("Erro", "Não foi possível gerar a prévia. Verifique sua conexão.");
        setPreviewingId(null);
        return;
      }

      // Salvar o MP3 temporariamente e reproduzir
      const tmpPath = `${FileSystem.cacheDirectory}voice_preview_${voice.voice_id}.mp3`;
      await FileSystem.writeAsStringAsync(tmpPath, result.base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      // Usar AudioPlayer para reproduzir
      const { useAudioPlayer: createPlayer } = await import("expo-audio");
      const player = createPlayer({ uri: tmpPath });
      audioPlayerRef.current = player;
      player.play();

      // Aguardar fim da reprodução
      const checkDone = setInterval(() => {
        if (!player.playing) {
          clearInterval(checkDone);
          setPreviewingId(null);
        }
      }, 500);

      // Timeout de segurança
      setTimeout(() => {
        clearInterval(checkDone);
        setPreviewingId(null);
      }, 30000);
    } catch (err) {
      console.warn("[VoiceSelector] Erro na prévia:", err);
      Alert.alert("Erro", "Não foi possível reproduzir a prévia.");
      setPreviewingId(null);
    }
  }, [previewingId, speakMutation]);

  const handleSelect = useCallback(async (voice: Voice) => {
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    setSelectedVoiceId(voice.voice_id);
    setSelectedVoiceName(voice.name);
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    try {
      const settings = await getSettings();
      await saveSettings({
        ...settings,
        selectedVoiceId,
        selectedVoiceName,
      });
      if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } catch {
      Alert.alert("Erro", "Não foi possível salvar a voz selecionada.");
    } finally {
      setSaving(false);
    }
  }, [selectedVoiceId, selectedVoiceName]);

  const renderVoice = useCallback(({ item }: { item: Voice }) => {
    const isSelected = item.voice_id === selectedVoiceId;
    const isPreviewing = previewingId === item.voice_id;

    return (
      <Pressable
        style={[
          styles.voiceCard,
          {
            backgroundColor: isSelected ? "#1A3A5C" : colors.surface,
            borderColor: isSelected ? "#22D3EE" : colors.border,
          },
        ]}
        onPress={() => handleSelect(item)}
      >
        <View style={styles.voiceInfo}>
          <View style={styles.voiceNameRow}>
            <Text style={[styles.voiceName, { color: isSelected ? "#fff" : colors.foreground }]}>
              {item.name}
            </Text>
            {isSelected && (
              <View style={styles.selectedBadge}>
                <IconSymbol name="checkmark.circle.fill" size={16} color="#22D3EE" />
                <Text style={styles.selectedText}>Selecionada</Text>
              </View>
            )}
          </View>
          <Text style={[styles.voiceDesc, { color: isSelected ? "rgba(255,255,255,0.7)" : colors.muted }]}>
            {item.description}
          </Text>
        </View>

        <Pressable
          style={[styles.previewBtn, { borderColor: isSelected ? "#22D3EE" : colors.border }]}
          onPress={() => playPreview(item)}
        >
          {isPreviewing ? (
            <ActivityIndicator size="small" color={isSelected ? "#22D3EE" : colors.primary} />
          ) : (
            <IconSymbol
              name="play.fill"
              size={16}
              color={isSelected ? "#22D3EE" : colors.primary}
            />
          )}
        </Pressable>
      </Pressable>
    );
  }, [selectedVoiceId, previewingId, colors, handleSelect, playPreview]);

  return (
    <ScreenContainer>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable style={styles.backBtn} onPress={() => router.back()}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Voz da Alaju</Text>
        <Pressable
          style={[styles.saveBtn, { backgroundColor: "#1A3A5C", opacity: saving ? 0.6 : 1 }]}
          onPress={handleSave}
          disabled={saving}
        >
          {saving ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.saveBtnText}>Salvar</Text>
          )}
        </Pressable>
      </View>

      {/* Info */}
      <View style={[styles.infoBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
        <IconSymbol name="speaker.wave.2.fill" size={18} color="#8B5CF6" />
        <Text style={[styles.infoText, { color: colors.muted }]}>
          Toque em ▶ para ouvir uma prévia de cada voz em português
        </Text>
      </View>

      {/* Lista de vozes */}
      {loadingVoices ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#1A3A5C" />
          <Text style={[styles.loadingText, { color: colors.muted }]}>Carregando vozes...</Text>
        </View>
      ) : voices.length === 0 ? (
        <View style={styles.loadingContainer}>
          <IconSymbol name="waveform" size={40} color={colors.muted} />
          <Text style={[styles.loadingText, { color: colors.muted }]}>
            Não foi possível carregar as vozes.{"\n"}Verifique sua conexão.
          </Text>
        </View>
      ) : (
        <FlatList
          data={voices}
          keyExtractor={(item) => item.voice_id}
          renderItem={renderVoice}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
  },
  backBtn: {
    padding: 8,
    marginRight: 4,
  },
  headerTitle: {
    flex: 1,
    fontSize: 18,
    fontWeight: "700",
    marginLeft: 4,
  },
  saveBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 70,
    alignItems: "center",
  },
  saveBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 14,
  },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    margin: 16,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  infoText: {
    flex: 1,
    fontSize: 13,
    lineHeight: 18,
  },
  loadingContainer: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    padding: 32,
  },
  loadingText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  listContent: {
    padding: 16,
    paddingBottom: 40,
  },
  voiceCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  voiceInfo: {
    flex: 1,
    gap: 4,
  },
  voiceNameRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  voiceName: {
    fontSize: 16,
    fontWeight: "700",
  },
  selectedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  selectedText: {
    fontSize: 12,
    color: "#22D3EE",
    fontWeight: "600",
  },
  voiceDesc: {
    fontSize: 13,
    lineHeight: 18,
  },
  previewBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: 12,
  },
});
