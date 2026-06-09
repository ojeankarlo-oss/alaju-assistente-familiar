import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getSettings, saveSettings } from "@/lib/family-store";
import { trpc } from "@/lib/trpc";
import type { AssistantSettings } from "@/shared/types";

function SettingRow({
  icon,
  iconColor,
  label,
  sublabel,
  right,
}: {
  icon: string;
  iconColor: string;
  label: string;
  sublabel?: string;
  right?: React.ReactNode;
}) {
  const colors = useColors();
  return (
    <View style={[styles.settingRow, { borderBottomColor: colors.border }]}>
      <View style={[styles.settingIcon, { backgroundColor: iconColor + "22" }]}>
        <IconSymbol name={icon as any} size={18} color={iconColor} />
      </View>
      <View style={styles.settingContent}>
        <Text style={[styles.settingLabel, { color: colors.foreground }]}>{label}</Text>
        {sublabel && <Text style={[styles.settingSub, { color: colors.muted }]}>{sublabel}</Text>}
      </View>
      {right}
    </View>
  );
}

export default function SettingsScreen() {
  const colors = useColors();
  const [settings, setSettings] = useState<AssistantSettings>({
    telegramBotToken: "",
    telegramChatId: "",
    voiceEnabled: true,
    notificationsEnabled: true,
    activeMemberId: "",
  });
  const [isTesting, setIsTesting] = useState(false);
  const [showToken, setShowToken] = useState(false);

  const testMutation = trpc.telegram.testConnection.useMutation();

  useEffect(() => {
    getSettings().then(setSettings);
  }, []);

  const handleSave = useCallback(async (updated: AssistantSettings) => {
    await saveSettings(updated);
    setSettings(updated);
  }, []);

  const handleTestTelegram = useCallback(async () => {
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      Alert.alert("Atenção", "Preencha o Token do Bot e o Chat ID antes de testar.");
      return;
    }
    setIsTesting(true);
    try {
      const result = await testMutation.mutateAsync({
        botToken: settings.telegramBotToken,
        chatId: settings.telegramChatId,
      });
      if (result.ok) {
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("✅ Conectado!", "Mensagem de teste enviada ao Telegram com sucesso.");
      } else {
        Alert.alert("Erro", "Não foi possível enviar. Verifique o Token e o Chat ID.");
      }
    } catch {
      Alert.alert("Erro", "Falha ao conectar ao Telegram.");
    } finally {
      setIsTesting(false);
    }
  }, [settings, testMutation]);

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <IconSymbol name="arrow.left" size={22} color={colors.foreground} />
        </Pressable>
        <Text style={[styles.headerTitle, { color: colors.foreground }]}>Configurações</Text>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        {/* Telegram section */}
        <Text style={[styles.sectionHeader, { color: colors.muted }]}>TELEGRAM</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <View style={styles.telegramInfo}>
            <IconSymbol name="info.circle.fill" size={16} color="#229ED9" />
            <Text style={[styles.telegramInfoText, { color: colors.muted }]}>
              Para usar o Telegram, crie um bot com o @BotFather e obtenha o Token. O Chat ID é o ID do seu chat pessoal ou grupo.
            </Text>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Token do Bot</Text>
          <View style={styles.tokenRow}>
            <TextInput
              style={[styles.fieldInput, { flex: 1, color: colors.foreground, borderColor: colors.border }]}
              placeholder="123456789:ABCdef..."
              placeholderTextColor={colors.muted}
              value={settings.telegramBotToken}
              onChangeText={(v) => handleSave({ ...settings, telegramBotToken: v })}
              secureTextEntry={!showToken}
              autoCapitalize="none"
              autoCorrect={false}
            />
            <Pressable onPress={() => setShowToken(!showToken)} style={styles.eyeBtn}>
              <IconSymbol name={showToken ? "eye.slash.fill" : "eye.fill"} size={18} color={colors.muted} />
            </Pressable>
          </View>

          <Text style={[styles.fieldLabel, { color: colors.muted }]}>Chat ID</Text>
          <TextInput
            style={[styles.fieldInput, { color: colors.foreground, borderColor: colors.border }]}
            placeholder="-100123456789 ou 123456789"
            placeholderTextColor={colors.muted}
            value={settings.telegramChatId}
            onChangeText={(v) => handleSave({ ...settings, telegramChatId: v })}
            keyboardType="numbers-and-punctuation"
            autoCapitalize="none"
          />

          <Pressable
            style={({ pressed }) => [
              styles.testBtn,
              { backgroundColor: isTesting ? colors.muted : "#229ED9" },
              pressed && { opacity: 0.85 },
            ]}
            onPress={handleTestTelegram}
            disabled={isTesting}
          >
            <IconSymbol name="paperplane.fill" size={16} color="#fff" />
            <Text style={styles.testBtnText}>{isTesting ? "Testando..." : "Testar Conexão"}</Text>
          </Pressable>
        </View>

        {/* Preferences */}
        <Text style={[styles.sectionHeader, { color: colors.muted }]}>PREFERÊNCIAS</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingRow
            icon="waveform"
            iconColor="#1A3A5C"
            label="Resposta por voz"
            sublabel="Fami fala as respostas em voz alta"
            right={
              <Switch
                value={settings.voiceEnabled}
                onValueChange={(v) => handleSave({ ...settings, voiceEnabled: v })}
                trackColor={{ false: colors.border, true: "#1A3A5C" }}
                thumbColor="#fff"
              />
            }
          />
          <SettingRow
            icon="bell.fill"
            iconColor="#F59E0B"
            label="Notificações"
            sublabel="Alertas de lembretes e eventos"
            right={
              <Switch
                value={settings.notificationsEnabled}
                onValueChange={(v) => handleSave({ ...settings, notificationsEnabled: v })}
                trackColor={{ false: colors.border, true: "#1A3A5C" }}
                thumbColor="#fff"
              />
            }
          />
        </View>

        {/* Family */}
        <Text style={[styles.sectionHeader, { color: colors.muted }]}>FAMÍLIA</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Pressable
            style={[styles.navRow, { borderBottomColor: colors.border }]}
            onPress={() => router.push("/family" as any)}
          >
            <View style={[styles.settingIcon, { backgroundColor: "#1A3A5C22" }]}>
              <IconSymbol name="person.2.fill" size={18} color="#1A3A5C" />
            </View>
            <Text style={[styles.navLabel, { color: colors.foreground }]}>Gerenciar Família</Text>
            <IconSymbol name="chevron.right" size={18} color={colors.muted} />
          </Pressable>
        </View>

        {/* About */}
        <Text style={[styles.sectionHeader, { color: colors.muted }]}>SOBRE</Text>
        <View style={[styles.sectionCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <SettingRow
            icon="info.circle.fill"
            iconColor="#2E86C1"
            label="Fami — Assistente Familiar"
            sublabel="Versão 1.0 MVP"
          />
          <SettingRow
            icon="shield.fill"
            iconColor="#22C55E"
            label="Privacidade"
            sublabel="Dados armazenados localmente no dispositivo"
          />
          <SettingRow
            icon="sparkles"
            iconColor="#8B5CF6"
            label="IA Integrada"
            sublabel="Powered by Manus AI"
          />
        </View>

        <View style={{ height: 40 }} />
      </ScrollView>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    gap: 14,
  },
  backBtn: { padding: 4 },
  headerTitle: { fontSize: 22, fontWeight: "700" },
  sectionHeader: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.8,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  sectionCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  telegramInfo: {
    flexDirection: "row",
    gap: 8,
    padding: 14,
    alignItems: "flex-start",
  },
  telegramInfoText: { flex: 1, fontSize: 13, lineHeight: 18 },
  fieldLabel: { fontSize: 12, fontWeight: "600", paddingHorizontal: 14, paddingBottom: 4 },
  fieldInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    marginHorizontal: 14,
    marginBottom: 12,
  },
  tokenRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 14,
    marginBottom: 12,
    gap: 8,
  },
  eyeBtn: { padding: 8 },
  testBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    margin: 14,
    marginTop: 2,
    borderRadius: 12,
    paddingVertical: 12,
  },
  testBtnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  settingRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  settingIcon: { width: 34, height: 34, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  settingContent: { flex: 1 },
  settingLabel: { fontSize: 15, fontWeight: "500" },
  settingSub: { fontSize: 12, marginTop: 2 },
  navRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  navLabel: { flex: 1, fontSize: 15, fontWeight: "500" },
});
