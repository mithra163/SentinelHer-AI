import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import { Shield, ShieldAlert, Send, Menu, LogOut, Activity, MapPin, AlertTriangle, ShieldCheck } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { 
  useSendMessage, 
  useGetChatHistory, 
  useGetSafetyStatus, 
  useTriggerSos,
  getGetChatHistoryQueryKey,
  getGetSafetyStatusQueryKey
} from "@workspace/api-client-react";
import type { ChatMessage } from "@workspace/api-client-react/src/generated/api.schemas";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";

// Audio tone generator for emergency
const playEmergencyTone = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    
    const playBeep = (freq: number, time: number, duration: number) => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, audioCtx.currentTime + time);
      
      gainNode.gain.setValueAtTime(0, audioCtx.currentTime + time);
      gainNode.gain.linearRampToValueAtTime(0.5, audioCtx.currentTime + time + 0.05);
      gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + time + duration);
      
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);
      
      osc.start(audioCtx.currentTime + time);
      osc.stop(audioCtx.currentTime + time + duration);
    };

    // SOS pattern: 3 short, 3 long, 3 short
    for (let i = 0; i < 3; i++) playBeep(800, i * 0.2, 0.1);
    for (let i = 0; i < 3; i++) playBeep(800, 0.6 + i * 0.4, 0.3);
    for (let i = 0; i < 3; i++) playBeep(800, 1.8 + i * 0.2, 0.1);
    
  } catch (e) {
    console.error("Audio API not supported");
  }
};

export default function Chat() {
  const { username, logout, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const [inputValue, setInputValue] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [isEmergency, setIsEmergency] = useState(false);
  const [sosConfirmOpen, setSosConfirmOpen] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: historyData, isLoading: historyLoading } = useGetChatHistory(
    { username: username || "" },
    { query: { enabled: !!username, queryKey: getGetChatHistoryQueryKey({ username: username || "" }) } }
  );

  const { data: safetyStatus } = useGetSafetyStatus(
    { username: username || "" },
    { query: { enabled: !!username, queryKey: getGetSafetyStatusQueryKey({ username: username || "" }) } }
  );

  const sendMessageMutation = useSendMessage();
  const triggerSosMutation = useTriggerSos();

  // Initialize messages from history
  useEffect(() => {
    if (historyData?.messages) {
      setLocalMessages(historyData.messages);
      
      // Check if last message was an emergency
      const lastMsg = historyData.messages[historyData.messages.length - 1];
      if (lastMsg && lastMsg.emergency) {
        setIsEmergency(true);
      }
    }
  }, [historyData]);

  // Auto scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, sendMessageMutation.isPending]);

  // Auth redirect
  useEffect(() => {
    if (!authLoading && !username) {
      setLocation("/login");
    }
  }, [username, authLoading, setLocation]);

  if (authLoading || !username) {
    return <div className="min-h-screen bg-background flex items-center justify-center"><div className="typing-dot bg-primary w-4 h-4 rounded-full" /></div>;
  }

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Morning ☀️";
    if (hour < 18) return "Afternoon 🌸";
    return "Night 🌙";
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || sendMessageMutation.isPending) return;

    const userMessage = inputValue.trim();
    setInputValue("");
    
    // Optimistic UI update
    const newUserMsg: ChatMessage = {
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString()
    };
    
    setLocalMessages(prev => [...prev, newUserMsg]);

    sendMessageMutation.mutate({
      data: { message: userMessage, username }
    }, {
      onSuccess: (data) => {
        const newAiMsg: ChatMessage = {
          role: "assistant",
          content: data.reply,
          timestamp: new Date().toISOString(),
          risk_level: data.risk_level,
          emergency: data.emergency
        };
        
        setLocalMessages(prev => [...prev, newAiMsg]);
        
        if (data.emergency) {
          setIsEmergency(true);
          playEmergencyTone();
        } else if (isEmergency) {
          // If we were in emergency but now we're not (e.g. user says they're safe)
          // we don't automatically turn it off here to be safe, but could be added
        }
        
        // Invalidate history to keep sync
        queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey({ username }) });
        queryClient.invalidateQueries({ queryKey: getGetSafetyStatusQueryKey({ username }) });
      },
      onError: () => {
        toast({
          title: "Message failed to send",
          description: "Please check your connection and try again.",
          variant: "destructive"
        });
        // Remove optimistic message
        setLocalMessages(prev => prev.slice(0, -1));
      }
    });
  };

  const handleSos = () => {
    triggerSosMutation.mutate({
      data: { username }
    }, {
      onSuccess: (data) => {
        setSosConfirmOpen(true);
        setIsEmergency(true);
        playEmergencyTone();
        
        // Add SOS system message
        const sosMsg: ChatMessage = {
          role: "assistant",
          content: data.reply || "SOS triggered. Emergency contacts and authorities have been notified.",
          timestamp: new Date().toISOString(),
          emergency: true,
          risk_level: "HIGH RISK"
        };
        setLocalMessages(prev => [...prev, sosMsg]);
        
        queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey({ username }) });
        queryClient.invalidateQueries({ queryKey: getGetSafetyStatusQueryKey({ username }) });
      }
    });
  };

  const renderRiskBadge = (level?: string | null) => {
    if (!level) return null;
    
    if (level === "SAFE") return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 mb-2"><ShieldCheck className="w-3 h-3 mr-1" /> Safe</Badge>;
    if (level === "MODERATE") return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 mb-2"><AlertTriangle className="w-3 h-3 mr-1" /> Moderate Risk</Badge>;
    if (level === "HIGH RISK") return <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20 mb-2 animate-pulse"><ShieldAlert className="w-3 h-3 mr-1" /> High Risk</Badge>;
    return null;
  };

  return (
    <div className={`flex flex-col min-h-[100dvh] bg-background text-foreground ${isEmergency ? 'emergency-ui-flash' : ''}`}>
      
      {/* Header */}
      <header className="sticky top-0 z-50 glass-card border-b border-white/5 flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="hover:bg-white/10" data-testid="button-menu">
                <Menu className="w-5 h-5 text-primary" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="glass-card border-white/10 bg-background/90 w-80 sm:w-96">
              <SheetHeader>
                <SheetTitle className="font-heading text-primary flex items-center gap-2">
                  <Shield className="w-5 h-5" /> AuraShield Status
                </SheetTitle>
              </SheetHeader>
              
              <div className="mt-8 space-y-6">
                <div className="flex items-center gap-4 p-4 rounded-xl bg-white/5 border border-white/10">
                  <Avatar className="w-12 h-12 border border-primary/30">
                    <AvatarFallback className="bg-primary/20 text-primary">{username.substring(0, 2).toUpperCase()}</AvatarFallback>
                  </Avatar>
                  <div>
                    <h3 className="font-medium text-lg">{username}</h3>
                    <p className="text-sm text-muted-foreground flex items-center gap-1">
                      <Activity className="w-3 h-3" /> Active Monitor
                    </p>
                  </div>
                </div>

                <div className="space-y-4">
                  <h4 className="font-heading text-sm text-muted-foreground uppercase tracking-wider">Safety Analytics</h4>
                  
                  <Card className="glass-card border-white/5">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Activity className="w-4 h-4 text-primary" />
                        <span>Current Risk Level</span>
                      </div>
                      {renderRiskBadge(safetyStatus?.risk_level || "SAFE")}
                    </CardContent>
                  </Card>
                  
                  <Card className="glass-card border-white/5">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <ShieldAlert className="w-4 h-4 text-destructive" />
                        <span>Emergencies</span>
                      </div>
                      <span className="font-mono text-xl">{safetyStatus?.emergency_count || 0}</span>
                    </CardContent>
                  </Card>
                  
                  {(safetyStatus?.unsafe_locations?.length ?? 0) > 0 && (
                    <Card className="glass-card border-white/5">
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-sm flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-accent" /> Flagged Locations
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0">
                        <div className="flex flex-wrap gap-2">
                          {safetyStatus?.unsafe_locations?.map((loc, i) => (
                            <Badge key={i} variant="secondary" className="bg-white/5">{loc}</Badge>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>

                <Button 
                  variant="ghost" 
                  className="w-full text-muted-foreground hover:text-white mt-auto"
                  onClick={() => logout()}
                  data-testid="button-logout"
                >
                  <LogOut className="w-4 h-4 mr-2" /> Disconnect
                </Button>
              </div>
            </SheetContent>
          </Sheet>
          
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center">
              <Shield className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="font-heading font-bold text-sm tracking-wide">AuraShield</h1>
              <p className="text-[10px] text-primary">Monitoring Active</p>
            </div>
          </div>
        </div>

        <Button 
          variant="destructive" 
          size="sm" 
          className="rounded-full font-heading tracking-widest px-6 shadow-lg shadow-destructive/20 animate-sos-pulse hover:bg-red-600 transition-colors"
          onClick={handleSos}
          disabled={triggerSosMutation.isPending}
          data-testid="button-sos"
        >
          {triggerSosMutation.isPending ? "SENDING..." : "SOS"}
        </Button>
      </header>

      {/* Emergency Alert Banner */}
      <AnimatePresence>
        {isEmergency && (
          <motion.div 
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-destructive/20 border-b border-destructive/50 p-4 emergency-flash flex items-center justify-between">
              <div className="flex items-center gap-3 text-destructive">
                <ShieldAlert className="w-6 h-6 shrink-0" />
                <div>
                  <h3 className="font-bold text-red-500">EMERGENCY DETECTED</h3>
                  <p className="text-sm text-red-400">Stay calm. Help is on the way.</p>
                </div>
              </div>
              <Button size="sm" variant="outline" className="border-destructive/30 text-destructive hover:bg-destructive/10" onClick={() => setIsEmergency(false)}>
                Dismiss
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 flex flex-col scroll-smooth">
        
        {localMessages.length === 0 && !historyLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto py-12">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6 neon-glow">
              <Shield className="w-10 h-10 text-primary" />
            </div>
            <h2 className="font-heading text-2xl mb-2">Good {getGreeting()}, {username}</h2>
            <p className="text-muted-foreground mb-8">I'm your personal safety guardian. I remember, protect, and adapt to keep you safe.</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              {[
                "I'm walking home alone.",
                "Share my location.",
                "Call me, I feel unsafe.",
                "Simulate a fake call."
              ].map((suggestion, i) => (
                <Button 
                  key={i} 
                  variant="outline" 
                  className="bg-white/5 border-white/10 hover:bg-white/10 justify-start text-left h-auto py-3 px-4 rounded-xl"
                  onClick={() => {
                    setInputValue(suggestion);
                    // Slight delay to allow state update before submitting
                    setTimeout(() => {
                      const form = document.getElementById('chat-form') as HTMLFormElement;
                      form?.requestSubmit();
                    }, 50);
                  }}
                >
                  <span className="truncate">{suggestion}</span>
                </Button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-6 pb-20">
            <AnimatePresence initial={false}>
              {localMessages.map((msg, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10, scale: 0.95 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  transition={{ duration: 0.3 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"} gap-3`}
                  data-testid={`message-${msg.role}-${index}`}
                >
                  {msg.role === "assistant" && (
                    <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-1">
                      <Shield className="w-4 h-4 text-primary" />
                    </div>
                  )}
                  
                  <div className={`max-w-[85%] sm:max-w-[75%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                    {msg.role === "assistant" && renderRiskBadge(msg.risk_level)}
                    
                    <div className={`
                      p-4 rounded-2xl text-sm sm:text-base whitespace-pre-wrap
                      ${msg.role === "user" 
                        ? "bg-primary text-primary-foreground rounded-tr-sm" 
                        : msg.emergency 
                          ? "bg-destructive/20 border border-destructive/50 text-red-100 rounded-tl-sm neon-glow-destructive"
                          : "glass-card border border-white/10 text-white rounded-tl-sm"
                      }
                    `}>
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 opacity-50 px-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </motion.div>
              ))}
              
              {sendMessageMutation.isPending && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start gap-3"
                >
                  <div className="w-8 h-8 rounded-full bg-primary/20 border border-primary/30 flex items-center justify-center shrink-0 mt-1">
                    <Shield className="w-4 h-4 text-primary" />
                  </div>
                  <div className="glass-card border border-white/10 rounded-2xl rounded-tl-sm p-4 flex items-center gap-1 h-12 w-16 justify-center">
                    <div className="w-1.5 h-1.5 bg-primary rounded-full typing-dot" />
                    <div className="w-1.5 h-1.5 bg-primary rounded-full typing-dot" />
                    <div className="w-1.5 h-1.5 bg-primary rounded-full typing-dot" />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
            <div ref={messagesEndRef} className="h-1" />
          </div>
        )}
      </main>

      {/* Input Area */}
      <div className="sticky bottom-0 p-4 bg-background/80 backdrop-blur-xl border-t border-white/5">
        <form id="chat-form" onSubmit={handleSend} className="max-w-4xl mx-auto relative flex items-end gap-2">
          <div className="relative flex-1">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Message AuraShield..."
              className="bg-white/5 border-white/10 focus-visible:ring-primary/50 rounded-2xl py-6 pl-4 pr-12 text-base resize-none"
              disabled={sendMessageMutation.isPending}
              data-testid="input-message"
              autoComplete="off"
            />
          </div>
          <Button 
            type="submit" 
            size="icon" 
            disabled={!inputValue.trim() || sendMessageMutation.isPending}
            className="rounded-full w-12 h-12 bg-primary hover:bg-primary/80 shrink-0 text-white shadow-lg neon-glow transition-all"
            data-testid="button-send"
          >
            <Send className="w-5 h-5" />
          </Button>
        </form>
      </div>

      {/* SOS Confirmation Modal */}
      <AlertDialog open={sosConfirmOpen} onOpenChange={setSosConfirmOpen}>
        <AlertDialogContent className="glass-card border-destructive/30">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <ShieldAlert className="w-6 h-6" /> SOS Alert Sent
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Your emergency contacts have been notified. Location tracking is active. Help is on the way.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-red-600">
              I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

    </div>
  );
}