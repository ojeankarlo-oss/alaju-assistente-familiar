import { useCallback, useEffect, useState } from "react";
import {
  Alert,
  FlatList,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as Haptics from "expo-haptics";
import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import {
  addShoppingItem,
  deleteShoppingItem,
  getActiveShoppingList,
  getSettings,
  markListSentToTelegram,
  toggleShoppingItem,
} from "@/lib/family-store";
import { trpc } from "@/lib/trpc";
import type { ShoppingItem, ShoppingList } from "@/shared/types";

function ShoppingItemRow({
  item,
  onToggle,
  onDelete,
}: {
  item: ShoppingItem;
  onToggle: () => void;
  onDelete: () => void;
}) {
  const colors = useColors();
  return (
    <View style={[styles.itemRow, { borderBottomColor: colors.border }]}>
      <Pressable
        style={({ pressed }) => [styles.checkBtn, pressed && { opacity: 0.6 }]}
        onPress={onToggle}
      >
        <IconSymbol
          name={item.checked ? "checkmark.circle.fill" : "checkmark.circle"}
          size={26}
          color={item.checked ? "#22C55E" : colors.muted}
        />
      </Pressable>
      <View style={styles.itemContent}>
        <Text
          style={[
            styles.itemName,
            { color: colors.foreground },
            item.checked && styles.strikethrough,
          ]}
        >
          {item.name}
        </Text>
        {item.quantity ? (
          <Text style={[styles.itemQty, { color: colors.muted }]}>{item.quantity}</Text>
        ) : null}
      </View>
      <Pressable
        style={({ pressed }) => [styles.deleteBtn, pressed && { opacity: 0.6 }]}
        onPress={onDelete}
      >
        <IconSymbol name="xmark" size={18} color={colors.muted} />
      </Pressable>
    </View>
  );
}

export default function ShoppingScreen() {
  const colors = useColors();
  const [list, setList] = useState<ShoppingList | null>(null);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);

  const sendListMutation = trpc.telegram.sendShoppingList.useMutation();

  const load = useCallback(async () => {
    const active = await getActiveShoppingList();
    setList(active);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleAdd = useCallback(async () => {
    if (!inputText.trim() || !list) return;
    if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    // Support "2x leite" or "leite (2 unidades)" formats
    const match = inputText.trim().match(/^(\d+[x×]\s*)?(.+?)(?:\s*\((.+)\))?$/i);
    const name = match?.[2]?.trim() || inputText.trim();
    const quantity = match?.[1]?.replace(/[x×\s]/g, "") ? `${match[1].replace(/[x×\s]/g, "")}x` : match?.[3]?.trim();
    await addShoppingItem(list.id, name, quantity);
    setInputText("");
    load();
  }, [inputText, list, load]);

  const handleToggle = useCallback(
    async (itemId: string) => {
      if (!list) return;
      if (Platform.OS !== "web") Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await toggleShoppingItem(list.id, itemId);
      load();
    },
    [list, load]
  );

  const handleDelete = useCallback(
    async (itemId: string) => {
      if (!list) return;
      await deleteShoppingItem(list.id, itemId);
      load();
    },
    [list, load]
  );

  const handleSendTelegram = useCallback(async () => {
    if (!list || list.items.length === 0) {
      Alert.alert("Lista vazia", "Adicione itens antes de enviar.");
      return;
    }
    const settings = await getSettings();
    if (!settings.telegramBotToken || !settings.telegramChatId) {
      Alert.alert(
        "Telegram não configurado",
        "Configure o Token do Bot e o Chat ID nas Configurações para enviar ao Telegram.",
        [{ text: "OK" }]
      );
      return;
    }
    setIsSending(true);
    try {
      const result = await sendListMutation.mutateAsync({
        botToken: settings.telegramBotToken,
        chatId: settings.telegramChatId,
        items: list.items,
        listName: list.name,
      });
      if (result.ok) {
        await markListSentToTelegram(list.id);
        if (Platform.OS !== "web") Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Alert.alert("✅ Enviado!", "Lista enviada ao Telegram com sucesso.");
        load();
      } else {
        Alert.alert("Erro", "Não foi possível enviar ao Telegram. Verifique as configurações.");
      }
    } catch {
      Alert.alert("Erro", "Falha ao conectar ao Telegram.");
    } finally {
      setIsSending(false);
    }
  }, [list, sendListMutation, load]);

  const checkedCount = list?.items.filter((i) => i.checked).length || 0;
  const totalCount = list?.items.length || 0;

  return (
    <ScreenContainer containerClassName="bg-background">
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <View>
          <Text style={[styles.headerTitle, { color: colors.foreground }]}>Lista de Compras</Text>
          {totalCount > 0 && (
            <Text style={[styles.headerSub, { color: colors.muted }]}>
              {checkedCount}/{totalCount} itens
            </Text>
          )}
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.telegramBtn,
            { backgroundColor: isSending ? colors.muted : "#229ED9" },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleSendTelegram}
          disabled={isSending}
        >
          <IconSymbol name="paperplane.fill" size={16} color="#fff" />
          <Text style={styles.telegramBtnText}>{isSending ? "Enviando..." : "Telegram"}</Text>
        </Pressable>
      </View>

      {/* Progress bar */}
      {totalCount > 0 && (
        <View style={[styles.progressBar, { backgroundColor: colors.border }]}>
          <View
            style={[
              styles.progressFill,
              {
                backgroundColor: "#22C55E",
                width: `${(checkedCount / totalCount) * 100}%`,
              },
            ]}
          />
        </View>
      )}

      {/* Items list */}
      <FlatList
        data={list?.items || []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <ShoppingItemRow
            item={item}
            onToggle={() => handleToggle(item.id)}
            onDelete={() => handleDelete(item.id)}
          />
        )}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <IconSymbol name="cart.fill" size={48} color={colors.muted} />
            <Text style={[styles.emptyText, { color: colors.muted }]}>Lista vazia</Text>
            <Text style={[styles.emptyHint, { color: colors.muted }]}>
              Adicione itens abaixo ou peça à Fami
            </Text>
          </View>
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Add input */}
      <View style={[styles.addArea, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          style={[styles.addInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
          placeholder="Adicionar item (ex: 2x leite)"
          placeholderTextColor={colors.muted}
          value={inputText}
          onChangeText={setInputText}
          onSubmitEditing={handleAdd}
          returnKeyType="done"
        />
        <Pressable
          style={({ pressed }) => [
            styles.addBtn,
            { backgroundColor: "#1A3A5C" },
            pressed && { opacity: 0.8 },
          ]}
          onPress={handleAdd}
        >
          <IconSymbol name="plus" size={22} color="#fff" />
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
  },
  headerTitle: { fontSize: 22, fontWeight: "700" },
  headerSub: { fontSize: 13, marginTop: 2 },
  telegramBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
  },
  telegramBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  progressBar: {
    height: 4,
    marginHorizontal: 20,
    marginTop: 8,
    borderRadius: 2,
    overflow: "hidden",
  },
  progressFill: { height: "100%", borderRadius: 2 },
  listContent: { paddingVertical: 8 },
  itemRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 0.5,
    gap: 12,
  },
  checkBtn: { padding: 2 },
  itemContent: { flex: 1 },
  itemName: { fontSize: 16, lineHeight: 22 },
  itemQty: { fontSize: 13, marginTop: 2 },
  deleteBtn: { padding: 4 },
  strikethrough: { textDecorationLine: "line-through" },
  emptyState: { alignItems: "center", paddingTop: 80, gap: 12 },
  emptyText: { fontSize: 17, fontWeight: "600" },
  emptyHint: { fontSize: 14 },
  addArea: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 0.5,
    gap: 10,
  },
  addInput: {
    flex: 1,
    borderRadius: 22,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
  },
  addBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
});
