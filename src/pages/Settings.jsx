import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, User, Timer, LogOut, Bell, Camera } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';

export default function Settings() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });

  const [pomodoroFocus, setPomodoroFocus] = useState('25');
  const [pomodoroBreak, setPomodoroBreak] = useState('5');
  const [notifHabits, setNotifHabits] = useState(true);
  const [notifGoals, setNotifGoals] = useState(true);
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  useEffect(() => {
    if (user?.pomodoro_focus) setPomodoroFocus(String(user.pomodoro_focus));
    if (user?.pomodoro_break) setPomodoroBreak(String(user.pomodoro_break));
    if (user?.avatar_url) setAvatarUrl(user.avatar_url);
  }, [user]);

  const handleAvatarChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingAvatar(true);
    const { file_url } = await base44.integrations.Core.UploadFile({ file });
    await base44.auth.updateMe({ avatar_url: file_url });
    setAvatarUrl(file_url);
    queryClient.invalidateQueries({ queryKey: ['me'] });
    setUploadingAvatar(false);
    toast.success('Foto atualizada!');
  };

  const saveSettings = async () => {
    await base44.auth.updateMe({
      pomodoro_focus: Number(pomodoroFocus),
      pomodoro_break: Number(pomodoroBreak),
    });
    queryClient.invalidateQueries({ queryKey: ['me'] });
    toast.success('Configurações salvas!');
  };

  const handleLogout = () => {
    base44.auth.logout();
  };

  return (
    <div className="max-w-xl mx-auto space-y-6">
      <h1 className="text-2xl font-bold">Configurações</h1>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><User className="w-4 h-4" />Perfil</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Avatar */}
          <div className="flex flex-col items-center gap-2">
            <label className="relative cursor-pointer group">
              <div className="w-20 h-20 rounded-full bg-secondary border-2 border-border overflow-hidden flex items-center justify-center">
                {avatarUrl
                  ? <img src={avatarUrl} alt="avatar" className="w-full h-full object-cover" />
                  : <User className="w-8 h-8 text-muted-foreground" />
                }
              </div>
              <div className="absolute inset-0 rounded-full bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                <Camera className="w-5 h-5 text-white" />
              </div>
              <input type="file" accept="image/*" className="hidden" onChange={handleAvatarChange} />
            </label>
            <p className="text-xs text-muted-foreground">{uploadingAvatar ? 'Enviando...' : 'Clique para alterar'}</p>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">Nome</Label>
            <p className="text-sm font-medium mt-1">{user?.full_name || '—'}</p>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">Email</Label>
            <p className="text-sm font-medium mt-1">{user?.email || '—'}</p>
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Timer className="w-4 h-4" />Pomodoro</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="text-sm text-muted-foreground">Duração do foco (minutos)</Label>
            <Select value={pomodoroFocus} onValueChange={setPomodoroFocus}>
              <SelectTrigger className="bg-secondary/50 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[15, 20, 25, 30, 45, 60].map(v => <SelectItem key={v} value={String(v)}>{v} min</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-sm text-muted-foreground">Duração da pausa (minutos)</Label>
            <Select value={pomodoroBreak} onValueChange={setPomodoroBreak}>
              <SelectTrigger className="bg-secondary/50 mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                {[3, 5, 10, 15].map(v => <SelectItem key={v} value={String(v)}>{v} min</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <Button onClick={saveSettings} className="w-full bg-primary hover:bg-primary/90">
            <Save className="w-4 h-4 mr-2" />Salvar Configurações
          </Button>
        </CardContent>
      </Card>

      {/* Notificações */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2"><Bell className="w-4 h-4" />Notificações</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Hábitos</p>
              <p className="text-xs text-muted-foreground">Lembretes diários</p>
            </div>
            <Switch checked={notifHabits} onCheckedChange={setNotifHabits} />
          </div>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Metas</p>
              <p className="text-xs text-muted-foreground">Atualizações de progresso</p>
            </div>
            <Switch checked={notifGoals} onCheckedChange={setNotifGoals} />
          </div>
        </CardContent>
      </Card>

      <Card className="bg-card border-border">
        <CardContent className="py-4">
          <Button onClick={handleLogout} variant="outline" className="w-full text-destructive border-destructive/20 hover:bg-destructive/10">
            <LogOut className="w-4 h-4 mr-2" />Sair da conta
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}