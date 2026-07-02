import React, { useState, useRef, useEffect, useCallback } from 'react';
import { forjaApi } from '@/api/forjaClient';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Mic, Square, Loader2, Check, X, Sparkles, ArrowLeft, Inbox } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export default function VoiceCapture() {
  const [searchParams, setSearchParams] = useSearchParams();
  const captureParam = searchParams.get('capture');

  const [recording, setRecording] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [items, setItems] = useState([]);
  const [transcription, setTranscription] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [activeCaptureId, setActiveCaptureId] = useState(captureParam || null);
  const mediaRecorder = useRef(null);
  const audioChunks = useRef([]);
  const recordingTimeout = useRef(null);
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data: pending } = useQuery({
    queryKey: ['captures', 'pending-count'],
    queryFn: () => forjaApi.captures.pendingCount(),
    staleTime: 20_000,
  });
  const inboxCount = pending?.count ?? 0;

  const applyParsedItems = useCallback((parseRes) => {
    const parsedItems = (parseRes.items || []).map((item, i) => ({
      ...item,
      id: i,
      category: item.category || 'pessoal',
      priority: item.priority || 'medium',
      confirmed: false,
    }));
    setItems(parsedItems);
    if (parsedItems.length === 0) {
      setErrorMessage('Transcrevi, mas não identifiquei nenhuma tarefa/hábito. Edite o texto e tente de novo mais tarde.');
    }
  }, []);

  const runParse = useCallback(async (text, captureId) => {
    const parseRes = await forjaApi.parseVoice(text);
    applyParsedItems(parseRes);
    if (captureId) {
      try {
        await forjaApi.captures.saveParsed(captureId, parseRes.items || []);
      } catch {
        /* non-blocking */
      }
    }
  }, [applyParsedItems]);

  useEffect(() => {
    if (!captureParam) return;
    let cancelled = false;
    (async () => {
      setProcessing(true);
      setErrorMessage('');
      try {
        const cap = await forjaApi.captures.get(captureParam);
        if (cancelled) return;
        setActiveCaptureId(cap.id);
        if (cap.parsed_items?.length) {
          setTranscription(cap.transcript || '');
          applyParsedItems({ items: cap.parsed_items });
        } else if (cap.transcript) {
          setTranscription(cap.transcript);
          await runParse(cap.transcript, cap.id);
        } else if (cap.status === 'failed') {
          setErrorMessage(cap.error_message || 'Esta captura falhou. Abra Revisar capturas para tentar de novo.');
        }
      } catch (e) {
        if (!cancelled) setErrorMessage('Não encontrei essa captura.');
      } finally {
        if (!cancelled) setProcessing(false);
      }
    })();
    return () => { cancelled = true; };
  }, [captureParam, applyParsedItems, runParse]);

  const startRecording = async () => {
    setErrorMessage('');
    setTranscription('');
    setItems([]);
    setActiveCaptureId(null);
    setSearchParams({});

    try {
      if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
        throw new Error('Seu navegador não suporta gravação de áudio nesta tela.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
      mediaRecorder.current = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      audioChunks.current = [];

      mediaRecorder.current.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.current.push(e.data);
      };

      mediaRecorder.current.onstop = async () => {
        if (recordingTimeout.current) clearTimeout(recordingTimeout.current);
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(audioChunks.current, { type: mimeType || 'audio/webm' });
        await processAudio(blob);
      };

      mediaRecorder.current.start();
      setRecording(true);
      recordingTimeout.current = setTimeout(() => stopRecording(), 90_000);
    } catch (error) {
      console.error('Microphone error:', error);
      setErrorMessage(error.message || 'Não consegui acessar o microfone. Verifique a permissão do navegador.');
      setRecording(false);
    }
  };

  const stopRecording = () => {
    if (recordingTimeout.current) clearTimeout(recordingTimeout.current);
    if (mediaRecorder.current && mediaRecorder.current.state === 'recording') {
      mediaRecorder.current.stop();
    }
    setRecording(false);
  };

  const processAudio = async (blob) => {
    setProcessing(true);

    try {
      const captureRes = await forjaApi.captures.submitAudio(blob);
      const captureId = captureRes.capture_id || null;
      setActiveCaptureId(captureId);
      const text = captureRes.text || '';
      setTranscription(text);
      await runParse(text, captureId);
      queryClient.invalidateQueries({ queryKey: ['captures'] });
    } catch (error) {
      console.error('Voice capture error:', error);
      const body = error.body || {};
      const captureId = body.capture_id;
      if (captureId) setActiveCaptureId(captureId);
      const detail = body.detail || error.message;
      if (body.exhausted && captureId) {
        setErrorMessage(
          `${detail || 'STT falhou.'} A gravação foi salva — abra Revisar capturas para tentar de novo.`,
        );
      } else {
        setErrorMessage(detail || 'Não consegui processar o áudio. Tente de novo em instantes.');
      }
      queryClient.invalidateQueries({ queryKey: ['captures'] });
    }

    setProcessing(false);
  };

  const updateItem = (id, field, value) => {
    setItems((prev) => prev.map((item) => (item.id === id ? { ...item, [field]: value } : item)));
  };

  const confirmItem = async (item) => {
    try {
      if (item.type === 'habit') {
        await forjaApi.habits.create({
          title: item.title,
          frequency: item.frequency || 'daily',
          category: item.category || 'pessoal',
          source: 'voice',
        });
      } else {
        await forjaApi.tasks.create({
          title: item.title,
          date: item.date || null,
          time: item.time || null,
          priority: item.priority || 'medium',
          category: item.category || 'pessoal',
          source: 'voice',
        });
      }
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, confirmed: true } : i)));
      queryClient.invalidateQueries();
    } catch (error) {
      console.error('Confirm error:', error);
    }
  };

  const confirmAll = async () => {
    const unconfirmed = items.filter((i) => !i.confirmed);
    for (const item of unconfirmed) {
      await confirmItem(item);
    }
    if (activeCaptureId) {
      try {
        await forjaApi.captures.archive(activeCaptureId);
        queryClient.invalidateQueries({ queryKey: ['captures'] });
      } catch {
        /* non-blocking */
      }
    }
  };

  const removeItem = (id) => {
    setItems((prev) => prev.filter((i) => i.id !== id));
  };

  const allConfirmed = items.length > 0 && items.every((i) => i.confirmed);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link to="/" className="text-muted-foreground hover:text-foreground"><ArrowLeft className="w-5 h-5" /></Link>
          <h1 className="text-2xl font-bold">Captura por Voz</h1>
        </div>
        <Button asChild variant="outline" size="sm" className="relative">
          <Link to="/capturas">
            <Inbox className="w-4 h-4 mr-1" />
            Revisar
            {inboxCount > 0 && (
              <span className="ml-1 rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                {inboxCount}
              </span>
            )}
          </Link>
        </Button>
      </div>

      <Card className="bg-card border-border">
        <CardContent className="py-12 flex flex-col items-center gap-6">
          <AnimatePresence mode="wait">
            {processing ? (
              <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4">
                <Loader2 className="w-12 h-12 text-primary animate-spin" />
                <p className="text-muted-foreground text-sm">Salvando áudio e transcrevendo (até 2 tentativas)…</p>
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
                <p className="text-xs text-muted-foreground">Áudio fica na fila do servidor se o STT falhar.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </CardContent>
      </Card>

      {errorMessage && (
        <Card className="bg-destructive/10 border-destructive/30">
          <CardContent className="py-4 space-y-2">
            <p className="text-sm text-destructive">{errorMessage}</p>
            {(activeCaptureId || inboxCount > 0) && (
              <Button asChild variant="secondary" size="sm">
                <Link to="/capturas">Abrir Revisar capturas</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {transcription && (
        <Card className="bg-secondary/30 border-border">
          <CardContent className="py-4">
            <p className="text-xs text-muted-foreground mb-1">Transcrição:</p>
            <p className="text-sm italic">&quot;{transcription}&quot;</p>
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
            {items.map((item) => (
              <motion.div key={item.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, x: -50 }}>
                <Card className={cn('bg-card border-border', item.confirmed && 'opacity-60')}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={item.type === 'habit' ? 'bg-primary/20 text-primary' : 'bg-accent/20 text-accent'}>
                          {item.type === 'habit' ? 'Hábito' : 'Tarefa'}
                        </Badge>
                        {item.confirmed && <Badge className="bg-accent/20 text-accent">Confirmado ✓</Badge>}
                      </div>
                      {!item.confirmed && (
                        <button type="button" onClick={() => removeItem(item.id)}><X className="w-4 h-4 text-muted-foreground hover:text-destructive" /></button>
                      )}
                    </div>
                    <Input value={item.title} onChange={(e) => updateItem(item.id, 'title', e.target.value)} className="bg-secondary/50" disabled={item.confirmed} />
                    <div className="grid grid-cols-2 gap-2">
                      {item.type === 'task' && (
                        <>
                          <Input type="date" value={item.date || ''} onChange={(e) => updateItem(item.id, 'date', e.target.value)} className="bg-secondary/50" disabled={item.confirmed} />
                          <Input type="time" value={item.time || ''} onChange={(e) => updateItem(item.id, 'time', e.target.value)} className="bg-secondary/50" disabled={item.confirmed} />
                        </>
                      )}
                      {item.type === 'habit' && (
                        <Select value={item.frequency || 'daily'} onValueChange={(v) => updateItem(item.id, 'frequency', v)} disabled={item.confirmed}>
                          <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="daily">Diário</SelectItem>
                            <SelectItem value="weekdays">Dias úteis</SelectItem>
                            <SelectItem value="weekly">Semanal</SelectItem>
                          </SelectContent>
                        </Select>
                      )}
                      <Select value={item.category || 'pessoal'} onValueChange={(v) => updateItem(item.id, 'category', v)} disabled={item.confirmed}>
                        <SelectTrigger className="bg-secondary/50"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="farmacia">💼 Trabalho / RCA</SelectItem>
                          <SelectItem value="treino">💪 Treino</SelectItem>
                          <SelectItem value="estudo">📚 Estudo</SelectItem>
                          <SelectItem value="jotav_fit">📸 @jotav.fit</SelectItem>
                          <SelectItem value="ideias">💡 Ideias</SelectItem>
                          <SelectItem value="pessoal">🏠 Pessoal</SelectItem>
                          <SelectItem value="rotina">🔥 Rotina</SelectItem>
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