import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Save, User, Timer, LogOut } from 'lucide-react';
import { toast } from 'sonner';

export default function Settings() {
  const queryClient = useQueryClient();

  const { data: user } = useQuery({ queryKey: ['me'], queryFn: () => base44.auth.me() });

  const [pomodoroFocus, setPomodoroFocus] = useState('25');
  const [pomodoroBreak, setPomodoroBreak] = useState('5');

  useEffect(() => {
    if (user?.pomodoro_focus) setPomodoroFocus(String(user.pomodoro_focus));
    if (user?.pomodoro_break) setPomodoroBreak(String(user.pomodoro_break));
  }, [user]);

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
        <CardContent className="space-y-3">
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