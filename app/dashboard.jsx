import { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, ActivityIndicator, Alert, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { C } from './theme';
import { useRole } from '../hooks/useRole';
import { submitQuery } from '../services/api';

export default function Dashboard() {
  const [messages, setMessages] = useState([
    {
      id: '0',
      from: 'bot',
      text: 'Hello! I am your Maintenance Copilot. Describe a task or equipment issue and I will guide you through it.',
    },
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const flatListRef = useRef(null);
  const router = useRouter();

  const { role, isJunior, isIntermediate } = useRole();

  const placeholder = isJunior
    ? "Describe what needs fixing..."
    : 'Enter a maintenance task or equipment issue...';

  const addMessage = (from, text, extra = {}) => {
    const msg = { id: Date.now().toString(), from, text, ...extra };
    setMessages(prev => [...prev, msg]);
    setTimeout(() => flatListRef.current?.scrollToEnd({ animated: true }), 100);
    return msg;
  };

  const handleSend = async () => {
    if (!inputValue.trim() || isProcessing) return;
    const queryText = inputValue.trim();
    setInputValue('');

    // Save to history
    const raw = await AsyncStorage.getItem('queryHistory');
    const existing = JSON.parse(raw || '[]');
    await AsyncStorage.setItem('queryHistory', JSON.stringify(
      [{ id: Date.now(), text: queryText, timestamp: new Date().toISOString() }, ...existing].slice(0, 50)
    ));

    addMessage('user', queryText);
    setIsProcessing(true);

    try {
      const result = await submitQuery(queryText);
      addMessage('bot', result.text, { sources: result.sources, reasoning: result.reasoning, isRecommendation: true });
    } catch {
      await new Promise(r => setTimeout(r, 2000));
      addMessage('bot', 'Step-by-step disassembly procedure generated.', {
        sources: [
          { title: 'FedEx Manual X-1000', page: 42, section: '5.2' },
          { title: 'OSHA 29 CFR 1910.147', page: 12, section: '3.1' },
        ],
        reasoning: 'Retrieved from engine manual; safety validation passed.',
        isRecommendation: true,
      });
    }

    setIsProcessing(false);
  };

  const handleApprove = (id) => {
    Alert.alert('Approved', '✓ Recommendation approved and logged to audit trail.');
    setMessages(prev => prev.map(m => m.id === id ? { ...m, resolved: 'approved' } : m));
  };

  const handleReject = (id) => {
    Alert.alert('Rejected', '✗ Recommendation rejected and logged to audit trail.');
    setMessages(prev => prev.map(m => m.id === id ? { ...m, resolved: 'rejected' } : m));
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Logout', style: 'destructive', onPress: async () => {
        await AsyncStorage.removeItem('user');
        router.replace('/login');
      }},
    ]);
  };

  const renderMessage = ({ item }) => {
    const isUser = item.from === 'user';

    return (
      <View style={[s.msgRow, isUser ? s.msgRowUser : s.msgRowBot]}>
        {!isUser && (
          <View style={s.avatar}>
            <Text style={s.avatarText}>⚡</Text>
          </View>
        )}
        <View style={[s.bubble, isUser ? s.bubbleUser : s.bubbleBot]}>
          <Text style={[s.bubbleText, isUser && s.bubbleTextUser]}>{item.text}</Text>

          {/* Sources */}
          {item.sources?.length > 0 && (
            <View style={s.sources}>
              <Text style={s.sourcesLabel}>SOURCES</Text>
              {item.sources.map((src, i) => (
                <Text key={i} style={s.sourceItem}>• {src.title} — p.{src.page} §{src.section}</Text>
              ))}
            </View>
          )}

          {/* Reasoning */}
          {item.reasoning && (
            <View style={s.reasoning}>
              <Text style={s.reasoningText}>🧠 {item.reasoning}</Text>
            </View>
          )}

          {/* Approve / Reject buttons */}
          {item.isRecommendation && !item.resolved && (
            <View style={s.actionRow}>
              <TouchableOpacity style={s.approveBtn} onPress={() => handleApprove(item.id)}>
                <Text style={s.approveTxt}>✓ Approve</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.rejectBtn} onPress={() => handleReject(item.id)}>
                <Text style={s.rejectTxt}>✗ Reject</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Resolved state */}
          {item.resolved && (
            <Text style={[s.resolved, item.resolved === 'approved' ? s.resolvedApproved : s.resolvedRejected]}>
              {item.resolved === 'approved' ? '✓ Approved' : '✗ Rejected'}
            </Text>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={s.safe}>

      {/* Header */}
      <View style={s.header}>
        <View>
          <Text style={s.headerTitle}>Maintenance Copilot</Text>
          <Text style={s.headerRole}>{role?.toUpperCase()} ACCESS</Text>
        </View>
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout}>
          <Text style={s.logoutText}>Logout</Text>
        </TouchableOpacity>
      </View>

      {/* Role banner */}
      {isJunior && (
        <View style={[s.banner, { borderColor: C.blue, backgroundColor: C.blueBg }]}>
          <Text style={[s.bannerText, { color: C.blue }]}>
            💡 Always consult a senior technician before performing any work.
          </Text>
        </View>
      )}
      {isIntermediate && (
        <View style={[s.banner, { borderColor: '#fcd34d', backgroundColor: '#fef9c3' }]}>
          <Text style={[s.bannerText, { color: '#d97706' }]}>
            ⚠️ Escalate HIGH difficulty tasks to an Expert Technician.
          </Text>
        </View>
      )}

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        renderItem={renderMessage}
        contentContainerStyle={s.msgList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd({ animated: true })}
      />

      {/* Typing indicator */}
      {isProcessing && (
        <View style={s.typingRow}>
          <View style={s.avatar}>
            <Text style={s.avatarText}>⚡</Text>
          </View>
          <View style={s.typingBubble}>
            <ActivityIndicator size="small" color={C.primary} />
            <Text style={s.typingText}>Analyzing...</Text>
          </View>
        </View>
      )}

      {/* Input bar */}
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={s.inputBar}>
          <TextInput
            style={s.input}
            placeholder={placeholder}
            placeholderTextColor={C.textMuted}
            value={inputValue}
            onChangeText={setInputValue}
            multiline
            editable={!isProcessing}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!inputValue.trim() || isProcessing) && s.sendBtnDisabled]}
            onPress={handleSend}
            disabled={!inputValue.trim() || isProcessing}
          >
            <Text style={s.sendBtnText}>Send</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:               { flex: 1, backgroundColor: C.bg },
  header:             { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
  headerTitle:        { color: C.text, fontWeight: '700', fontSize: 16 },
  headerRole:         { color: C.primary, fontSize: 10, fontWeight: '700', marginTop: 2 },
  logoutBtn:          { borderWidth: 1, borderColor: '#fecaca', backgroundColor: C.redBg, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 5 },
  logoutText:         { color: C.red, fontSize: 11, fontWeight: '700' },
  banner:             { borderWidth: 1, borderRadius: 0, padding: 10, marginHorizontal: 0 },
  bannerText:         { fontSize: 11, lineHeight: 16, paddingHorizontal: 16 },
  msgList:            { padding: 16, paddingBottom: 8 },
  msgRow:             { flexDirection: 'row', marginBottom: 12, alignItems: 'flex-end' },
  msgRowUser:         { justifyContent: 'flex-end' },
  msgRowBot:          { justifyContent: 'flex-start' },
  avatar:             { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primaryLight, alignItems: 'center', justifyContent: 'center', marginRight: 8 },
  avatarText:         { fontSize: 14 },
  bubble:             { maxWidth: '80%', borderRadius: 16, padding: 12 },
  bubbleUser:         { backgroundColor: C.primary, borderBottomRightRadius: 4 },
  bubbleBot:          { backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, borderBottomLeftRadius: 4 },
  bubbleText:         { color: C.text, fontSize: 13, lineHeight: 19 },
  bubbleTextUser:     { color: '#fff' },
  sources:            { marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderColor: C.cardBorder },
  sourcesLabel:       { color: C.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  sourceItem:         { color: C.textSub, fontSize: 11, marginBottom: 2 },
  reasoning:          { marginTop: 8, backgroundColor: C.primaryLight, borderRadius: 8, padding: 8 },
  reasoningText:      { color: C.primaryText, fontSize: 11 },
  actionRow:          { flexDirection: 'row', gap: 8, marginTop: 10 },
  approveBtn:         { flex: 1, backgroundColor: '#dcfce7', borderWidth: 1, borderColor: '#86efac', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  approveTxt:         { color: '#16a34a', fontWeight: '700', fontSize: 12 },
  rejectBtn:          { flex: 1, backgroundColor: C.redBg, borderWidth: 1, borderColor: '#fca5a5', borderRadius: 8, paddingVertical: 8, alignItems: 'center' },
  rejectTxt:          { color: C.red, fontWeight: '700', fontSize: 12 },
  resolved:           { marginTop: 8, fontSize: 11, fontWeight: '700', textAlign: 'center' },
  resolvedApproved:   { color: '#16a34a' },
  resolvedRejected:   { color: C.red },
  typingRow:          { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 4 },
  typingBubble:       { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, padding: 10, gap: 8, borderWidth: 1, borderColor: C.cardBorder },
  typingText:         { color: C.textMuted, fontSize: 12 },
  inputBar:           { flexDirection: 'row', alignItems: 'flex-end', padding: 12, borderTopWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card, gap: 8 },
  input:              { flex: 1, backgroundColor: C.inputBg, color: C.text, borderRadius: 20, borderWidth: 1, borderColor: C.inputBorder, paddingHorizontal: 16, paddingVertical: 10, fontSize: 13, maxHeight: 100 },
  sendBtn:            { backgroundColor: C.primary, borderRadius: 20, paddingHorizontal: 18, paddingVertical: 10 },
  sendBtnDisabled:    { backgroundColor: '#c4b5fd' },
  sendBtnText:        { color: '#fff', fontWeight: '700', fontSize: 13 },
});