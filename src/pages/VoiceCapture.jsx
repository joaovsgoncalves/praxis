import React, { useState, useRef } from 'react';
import { base44 } from '@/api/base44Client';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Square, Loader2, Check, X, Sparkles, ArrowLeft } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';
import { Link } from 'react-router-dom';

// API do Forja do Jota (A.N.A. backend)
const FORJA_API = import.meta.env.VITE_FORJA_API || 'http://100.110.93.24:18556';

export default function VoiceCapture() {
  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [items, setItems] = useState([]);
  const [transcription, setTranscription] = useState('');
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const startRecording = async () => {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder.current = new MediaRecorder(stream);
    audioChunks.current = [];

    mediaRecorder.current.ondataavailable = (e) => {
      if (e.data.size > 0) audioChunks.current.push(e.data);
    };

    mediaRecorder.current.onstop = async () => {
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(audioChunks.current, { type: 'audio/webm' });
      await processAudio(blob);
    };

    mediaRecorder.current.start();
    setRecording(true);
  };

  const stopRecording = () => {
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop();
    }
    setRecording(false);
  };

  const processAudio = async (blob) => {
    setProcessing(true);
    
    try {
      // 1. Send audio to Forja API for transcription
      const formData = new FormData();
      formData.append('audio', blob, 'audio.webm');

      const transcribeRes = await fetch(`${FORJA_API}/api/transcribe`, {
        method: 'POST',
        body: formData,
      });

      if (!transcribeRes.ok) throw new Error('Transcription failed');
      const { text } = await transcribeRes.json();
      setTranscription(text);

      // 2. Parse transcription into items using LLM
      const parseRes = await base44.integrations.Core.InvokeLLM({
        prompt: `You are a productivity assistant. You receive a transcription and must extract tasks and habits from it.

For each item, determine:
- type: "task" or "habit"
- title: clear, concise title
- date: if mentioned (format YYYY-MM-DD), null otherwise
- time: if mentioned (format HH:MM), null otherwise
- frequency: for habits only (daily, weekdays, weekends, weekly), null for tasks
- category: infer from context (work, personal, health, learning, finance, other)
- priority: infer from context (high, medium, low)

Today's date is ${new Date().toISOString().split('T')[0]}.
When the user says "amanhã" (tomorrow), use tomorrow's date.
When the user says "hoje" (today), use today's date.

Transcription: "${text}"

Return items in Portuguese. Be smart about inferring dates and categories.`,
        response_json_schema: {
          type: "object",
          properties: {
            transcription: { type: "string" },
            items: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  type: { type: "string" },
                  title: { type: "string" },
                  date: { type: "string" },
                  time: { type: "string" },
                  frequency: { type: "string" },
                  category: { type: "string" },
                  priority: { type: "string" },
                }
              }
            }
          }
        }
      });

      setItems((parseRes.items || []).map((item, i) => ({ ...item, id: i, confirmed: false })));
    } catch (error) {
      console.error('Voice capture error:', error);
      setTranscription('Erro ao processar áudio. Tente novamente.');
    }
    
    setProcessing(false);
  };

  const updateItem = (id, field, value) => {
    setItems(prev => prev.map(item => item.id === id ? { ...item, [field]: value } : item));
  };

  const confirmItem = async (item) => {
    try {
      if (item.type === 'habit') {
        await fetch(`${FORJA_API}/api/habits`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: item.title,
            frequency: item.frequency || 'daily',
            source: 'voice',
          }),
        });
      } else {
        await fetch(`${FORJA_API}/api/tasks`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: item.title,
            date: item.date || null,
            time: item.time || null,
            priority: item.priority || 'medium',
            category: item.category || 'personal',
            source: 'voice',
          }),
        });
      }
      setItems(prev => prev.map(i => i.id === item.id ? { ...i, confirmed: true } : i));
      queryClient.invalidateQueries();
    } catch (error) {
      console.error('Confirm error:', error);
    }
  };

  const confirmAll = async () => {
    const unconfirmed = items.filter(i => !i.confirmed);
    for (const item of unconfirmed) {
      await confirmItem(item);
    }
  };

  const removeItem = (id) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const allConfirmed = items.length > 0 && items.every(i => i.confirmed);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></Link>
        <h1 className="text-2xl font-bold">Captura por Voz</h1>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="py-12 flex flex-col items-center gap-6">
          <AnimatePresence mode="wait">
            {processing ? (
              <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-muted-foreground text-sm">A IA está interpretando seu áudio...</p>
              </motion.div>
            ) : recording ? (
              <motion.div key="recording" initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="flex flex-col items-center gap-4">
                <motion.div animate={{ scale: [1, 1.2, 1] }} transition={{ repeat: Infinity, duration: 1.5 }} className="w-24 h-24 rounded-full bg-destructive/20 flex items-center justify-center">
                  <div className="w-16 h-16 rounded-full bg-destructive/40 flex items-center justify-center">
                    <Mic className="w-8 h-8 text-destructive" />
                  </div>
                </motion.div>
                <p className="text-sm text-muted-foreground">Gravando... Fale sobre suas tarefas e hábitos</p>
                <Button onClick={stopRecording} variant="destructive" size="lg" className="rounded-full">
                  <Square className="w-4 h-4 mr-2" />Parar
                </Button>
              </motion.div>
            ) : (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
                <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }} onClick={startRecording}
                  className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center hover:bg-primary/30 transition-colors">
                  <Mic className="w-10 h-10 text-primary" />
                </motion.button>
                <p className="text-sm text-muted-foreground">Toque para gravar. Diga suas tarefas e hábitos.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {transcription && (
        <Card className="bg-secondary/30 border-border">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground mb-1">Transcrição:</p>
            <p className="text-sm italic">"{transcription}"</p>
          </CardContent>
        </Card>
      )}

      {items.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold flex items-center gap-2"><Sparkles className="w-4 h-4 text-primary" />Itens Identificados</h2>
            {!allConfirmed && (
              <Button onClick={confirmAll} size="sm" className="bg-accent text-accent-foreground hover:bg-accent/90">
                <Check className="w-4 h-4 mr-1" />Confirmar Todos
              </Button>
            )}
          </div>

          <AnimatePresence>
            {items.map(item => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -50 }}>
                <Card className={cn("bg-card border-border", item.confirmed && "opacity-60")}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={item.type === 'habit' ? 'bg-primary/20 text-primary' : 'bg-accent/20 text-accent'}>
                          {item.type === 'habit' ? 'Hábito' : 'Tarefa'}
                        </Badge>
                        {item.confirmed && <Badge className="bg-accent/20 text-accent">Confirmado ✓</Badge>}
                      </div>
                      {!item.confirmed && (
                        <button onClick={() => removeItem(item.id)}><X className="w-4 h-4 text-muted-foreground hover:text-destructive" /></button>
                      )}
                    </div>
                    <Input value={item.title} onChange={e => updateItem(item.id, 'title', e.target.value)} className="bg-secondary/50" disabled={item.confirmed} />
                    <div className="grid grid-cols-2 gap-2">
                      {item.type === 'task' && (
                        <>
                          <Input type="date" value={item.date || ''} onChange={e => updateItem(item.id, 'date', e.target.value)} className="bg-secondary/50" disabled={item.confirmed} />
                          <Input type="time" value={item.time || ''} onChange={e => updateItem(item.id, 'time', e.target.value)} className="bg-secondary/50" disabled={item.confirmed} />
                        </>
                      )}
                      {item.type === 'habit' && (
                        <Select value={item.frequency || 'daily'} onValueChange={v => updateItem(item.id, 'frequency', v)} disabled={item.confirmed}>
                          <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Diário</SelectItem>
                            <SelectItem value="weekdays">Dias úteis</SelectItem>
                            <SelectItem value="weekly">Semanal</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Select value={item.category || 'personal'} onValueChange={v => updateItem(item.id, 'category', v)} disabled={item.confirmed}>
                        <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="work">Trabalho</SelectItem>
                          <SelectItem value="personal">Pessoal</SelectItem>
                          <SelectItem value="health">Saúde</SelectItem>
                          <SelectItem value="learning">Aprendizado</SelectItem>
                          <SelectItem value="other">Outro</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {!item.confirmed && (
                      <Button onClick={() => confirmItem(item)} className="w-full bg-primary hover:bg-primary/90" size="sm">
                        <Check className="w-4 h-4 mr-1" />Confirmar
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>

          {allConfirmed && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-center py-4">
              <p className="text-accent font-medium">Tudo confirmado! ✨</p>
              <Button onClick={() => navigate('/')} variant="outline" className="mt-2">Voltar ao Dashboard</Button>
            </motion.div>
          )}
        </div>
      )}
    </div>
  );
}
