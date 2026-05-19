import { useState, useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, ShieldAlert, Send, Menu, LogOut, Activity, MapPin,
  AlertTriangle, ShieldCheck, Phone, UserPlus, Trash2, X, Users
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  useSendMessage,
  useGetChatHistory,
  useGetSafetyStatus,
  useTriggerSos,
  useGetContacts,
  useAddContact,
  useDeleteContact,
  getGetChatHistoryQueryKey,
  getGetSafetyStatusQueryKey,
  getGetContactsQueryKey,
} from "@workspace/api-client-react";
import type { ChatMessage, EmergencyContact } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

const playEmergencyTone = () => {
  try {
    const audioCtx = new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
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
    for (let i = 0; i < 3; i++) playBeep(800, i * 0.2, 0.1);
    for (let i = 0; i < 3; i++) playBeep(800, 0.6 + i * 0.4, 0.3);
    for (let i = 0; i < 3; i++) playBeep(800, 1.8 + i * 0.2, 0.1);
  } catch {
    /* Audio not supported */
  }
};

function ContactCard({ contact, index, onDelete }: { contact: EmergencyContact; index: number; onDelete: (i: number) => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      className="flex items-center gap-3 p-3 rounded-xl bg-white/5 border border-white/10 group"
      data-testid={`contact-card-${index}`}
    >
      <div className="w-9 h-9 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
        <Phone className="w-4 h-4 text-primary" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-sm truncate">{contact.name}</p>
        <p className="text-xs text-muted-foreground truncate">{contact.relation}</p>
        <a
          href={`tel:${contact.phone}`}
          className="text-xs text-primary hover:text-primary/80 transition-colors font-mono"
          data-testid={`link-call-${index}`}
        >
          {contact.phone}
        </a>
      </div>
      <button
        onClick={() => onDelete(index)}
        className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded-lg hover:bg-destructive/10 text-destructive"
        data-testid={`button-delete-contact-${index}`}
        aria-label="Delete contact"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </motion.div>
  );
}

export default function Chat() {
  const { username, logout, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [inputValue, setInputValue] = useState("");
  const [localMessages, setLocalMessages] = useState<ChatMessage[]>([]);
  const [isEmergency, setIsEmergency] = useState(false);
  const [sosConfirmOpen, setSosConfirmOpen] = useState(false);
  const [sosContacts, setSosContacts] = useState<EmergencyContact[]>([]);
  const [addContactOpen, setAddContactOpen] = useState(false);
  const [newContact, setNewContact] = useState({ name: "", phone: "", relation: "" });

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const contactsQueryKey = getGetContactsQueryKey({ username: username || "" });

  const { data: historyData, isLoading: historyLoading } = useGetChatHistory(
    { username: username || "" },
    { query: { enabled: !!username, queryKey: getGetChatHistoryQueryKey({ username: username || "" }) } }
  );

  const { data: safetyStatus } = useGetSafetyStatus(
    { username: username || "" },
    { query: { enabled: !!username, queryKey: getGetSafetyStatusQueryKey({ username: username || "" }) } }
  );

  const { data: contactsData } = useGetContacts(
    { username: username || "" },
    { query: { enabled: !!username, queryKey: contactsQueryKey } }
  );

  const sendMessageMutation = useSendMessage();
  const triggerSosMutation = useTriggerSos();
  const addContactMutation = useAddContact();
  const deleteContactMutation = useDeleteContact();

  const contacts = contactsData?.contacts ?? [];

  useEffect(() => {
    if (historyData?.messages) {
      setLocalMessages(historyData.messages);
      const lastMsg = historyData.messages[historyData.messages.length - 1];
      if (lastMsg?.emergency) setIsEmergency(true);
    }
  }, [historyData]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [localMessages, sendMessageMutation.isPending]);

  useEffect(() => {
    if (!authLoading && !username) setLocation("/login");
  }, [username, authLoading, setLocation]);

  if (authLoading || !username) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="typing-dot bg-primary w-4 h-4 rounded-full" />
      </div>
    );
  }

  const getGreeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Morning ☀️";
    if (h < 18) return "Afternoon 🌸";
    return "Night 🌙";
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim() || sendMessageMutation.isPending) return;
    const userMessage = inputValue.trim();
    setInputValue("");

    const newUserMsg: ChatMessage = {
      role: "user",
      content: userMessage,
      timestamp: new Date().toISOString(),
    };
    setLocalMessages((prev) => [...prev, newUserMsg]);

    sendMessageMutation.mutate(
      { data: { message: userMessage, username } },
      {
        onSuccess: (data) => {
          const newAiMsg: ChatMessage = {
            role: "assistant",
            content: data.reply,
            timestamp: new Date().toISOString(),
            risk_level: data.risk_level,
            emergency: data.emergency,
          };
          setLocalMessages((prev) => [...prev, newAiMsg]);
          if (data.emergency) {
            setIsEmergency(true);
            playEmergencyTone();
          }
          queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey({ username }) });
          queryClient.invalidateQueries({ queryKey: getGetSafetyStatusQueryKey({ username }) });
        },
        onError: () => {
          toast({ title: "Message failed", description: "Please try again.", variant: "destructive" });
          setLocalMessages((prev) => prev.slice(0, -1));
        },
      }
    );
  };

  const handleSos = () => {
    triggerSosMutation.mutate(
      { data: { username } },
      {
        onSuccess: (data) => {
          setSosContacts(data.contacts ?? contacts);
          setSosConfirmOpen(true);
          setIsEmergency(true);
          playEmergencyTone();
          const sosMsg: ChatMessage = {
            role: "assistant",
            content: data.reply || "SOS triggered. Stay safe — help is on the way.",
            timestamp: new Date().toISOString(),
            emergency: true,
            risk_level: "HIGH RISK",
          };
          setLocalMessages((prev) => [...prev, sosMsg]);
          queryClient.invalidateQueries({ queryKey: getGetChatHistoryQueryKey({ username }) });
          queryClient.invalidateQueries({ queryKey: getGetSafetyStatusQueryKey({ username }) });
        },
      }
    );
  };

  const handleAddContact = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newContact.name.trim() || !newContact.phone.trim()) return;
    addContactMutation.mutate(
      {
        data: {
          username,
          name: newContact.name.trim(),
          phone: newContact.phone.trim(),
          relation: newContact.relation.trim() || "Contact",
        },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: contactsQueryKey });
          setNewContact({ name: "", phone: "", relation: "" });
          setAddContactOpen(false);
          toast({ title: "Contact added", description: `${newContact.name} is now an emergency contact.` });
        },
        onError: (err: unknown) => {
          const msg = err instanceof Error ? err.message : "Could not add contact";
          toast({ title: "Error", description: msg, variant: "destructive" });
        },
      }
    );
  };

  const handleDeleteContact = (index: number) => {
    deleteContactMutation.mutate(
      { index, params: { username } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: contactsQueryKey });
          toast({ title: "Contact removed" });
        },
      }
    );
  };

  const renderRiskBadge = (level?: string | null) => {
    if (!level) return null;
    if (level === "SAFE") return <Badge variant="outline" className="bg-green-500/10 text-green-500 border-green-500/20 mb-2"><ShieldCheck className="w-3 h-3 mr-1" />Safe</Badge>;
    if (level === "MODERATE") return <Badge variant="outline" className="bg-amber-500/10 text-amber-500 border-amber-500/20 mb-2"><AlertTriangle className="w-3 h-3 mr-1" />Moderate</Badge>;
    if (level === "HIGH RISK") return <Badge variant="destructive" className="bg-red-500/10 text-red-500 border-red-500/20 mb-2 animate-pulse"><ShieldAlert className="w-3 h-3 mr-1" />High Risk</Badge>;
    return null;
  };

  return (
    <div className={`flex flex-col min-h-[100dvh] bg-background text-foreground ${isEmergency ? "emergency-ui-flash" : ""}`}>

      {/* Header */}
      <header className="sticky top-0 z-50 glass-card border-b border-white/5 flex items-center justify-between p-4">
        <div className="flex items-center gap-3">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="hover:bg-white/10" data-testid="button-menu">
                <Menu className="w-5 h-5 text-primary" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="glass-card border-white/10 bg-background/90 w-80 sm:w-96 overflow-y-auto">
              <SheetHeader>
                <SheetTitle className="font-heading text-primary flex items-center gap-2">
                  <Shield className="w-5 h-5" /> AuraShield Status
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-6">
                {/* User */}
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

                {/* Safety stats */}
                <div className="space-y-3">
                  <h4 className="font-heading text-xs text-muted-foreground uppercase tracking-wider">Safety Analytics</h4>
                  <Card className="glass-card border-white/5">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <Activity className="w-4 h-4 text-primary" /> Current Risk
                      </div>
                      {renderRiskBadge(safetyStatus?.risk_level || "SAFE")}
                    </CardContent>
                  </Card>
                  <Card className="glass-card border-white/5">
                    <CardContent className="p-4 flex items-center justify-between">
                      <div className="flex items-center gap-2 text-sm">
                        <ShieldAlert className="w-4 h-4 text-destructive" /> Emergencies
                      </div>
                      <span className="font-mono text-xl">{safetyStatus?.emergency_count || 0}</span>
                    </CardContent>
                  </Card>
                  {(safetyStatus?.unsafe_locations?.length ?? 0) > 0 && (
                    <Card className="glass-card border-white/5">
                      <CardHeader className="p-4 pb-2">
                        <CardTitle className="text-xs flex items-center gap-2 text-muted-foreground uppercase tracking-wider">
                          <MapPin className="w-3.5 h-3.5 text-accent" /> Flagged Locations
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-4 pt-0 flex flex-wrap gap-2">
                        {safetyStatus?.unsafe_locations?.map((loc, i) => (
                          <Badge key={i} variant="secondary" className="bg-white/5 text-xs">{loc}</Badge>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {/* Emergency Contacts */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-heading text-xs text-muted-foreground uppercase tracking-wider flex items-center gap-2">
                      <Users className="w-3.5 h-3.5" /> Emergency Contacts
                    </h4>
                    {contacts.length < 3 && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs text-primary hover:text-primary/80 hover:bg-primary/10"
                        onClick={() => setAddContactOpen(true)}
                        data-testid="button-add-contact"
                      >
                        <UserPlus className="w-3.5 h-3.5 mr-1" /> Add
                      </Button>
                    )}
                  </div>

                  {contacts.length === 0 ? (
                    <button
                      onClick={() => setAddContactOpen(true)}
                      className="w-full p-4 rounded-xl border border-dashed border-white/15 text-center text-sm text-muted-foreground hover:border-primary/40 hover:text-primary/70 transition-colors"
                      data-testid="button-add-first-contact"
                    >
                      <UserPlus className="w-5 h-5 mx-auto mb-2 opacity-50" />
                      Add trusted contacts for emergencies
                      <p className="text-[11px] mt-1 opacity-60">Up to 3 neighbours or friends</p>
                    </button>
                  ) : (
                    <AnimatePresence>
                      {contacts.map((c, i) => (
                        <ContactCard key={i} contact={c} index={i} onDelete={handleDeleteContact} />
                      ))}
                    </AnimatePresence>
                  )}
                </div>

                <Button
                  variant="ghost"
                  className="w-full text-muted-foreground hover:text-white"
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

      {/* Emergency Banner */}
      <AnimatePresence>
        {isEmergency && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="bg-destructive/20 border-b border-destructive/50 p-4 emergency-flash">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 text-destructive">
                  <ShieldAlert className="w-6 h-6 shrink-0" />
                  <div>
                    <h3 className="font-bold text-red-500">EMERGENCY DETECTED — Stay calm.</h3>
                    {contacts.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {contacts.map((c, i) => (
                          <a
                            key={i}
                            href={`tel:${c.phone}`}
                            className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 border border-red-500/40 text-red-300 text-xs hover:bg-red-500/30 transition-colors"
                            data-testid={`link-emergency-call-${i}`}
                          >
                            <Phone className="w-3 h-3" /> {c.name}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:bg-destructive/10 shrink-0"
                  onClick={() => setIsEmergency(false)}
                  data-testid="button-dismiss-emergency"
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Chat Area */}
      <main className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 flex flex-col scroll-smooth">
        {localMessages.length === 0 && !historyLoading ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center max-w-md mx-auto py-12">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-6 neon-glow">
              <Shield className="w-10 h-10 text-primary" />
            </div>
            <h2 className="font-heading text-2xl mb-2">Good {getGreeting()}, {username}</h2>
            <p className="text-muted-foreground mb-8">I'm your personal safety guardian. I remember, protect, and adapt to keep you safe.</p>
            {contacts.length === 0 && (
              <motion.button
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                onClick={() => setAddContactOpen(true)}
                className="mb-6 flex items-center gap-2 px-4 py-2.5 rounded-xl border border-primary/30 bg-primary/10 text-primary text-sm hover:bg-primary/20 transition-colors"
                data-testid="button-add-contact-prompt"
              >
                <UserPlus className="w-4 h-4" />
                Add emergency contacts — neighbours or friends
              </motion.button>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
              {["I'm walking home alone.", "Someone is following me.", "Call me, I feel unsafe.", "I need safety tips."].map((s, i) => (
                <Button
                  key={i}
                  variant="outline"
                  className="bg-white/5 border-white/10 hover:bg-white/10 justify-start text-left h-auto py-3 px-4 rounded-xl"
                  onClick={() => {
                    setInputValue(s);
                    setTimeout(() => {
                      (document.getElementById("chat-form") as HTMLFormElement)?.requestSubmit();
                    }, 50);
                  }}
                >
                  <span className="truncate text-sm">{s}</span>
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
                    <div className={`p-4 rounded-2xl text-sm sm:text-base whitespace-pre-wrap ${
                      msg.role === "user"
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : msg.emergency
                          ? "bg-destructive/20 border border-destructive/50 text-red-100 rounded-tl-sm"
                          : "glass-card border border-white/10 text-white rounded-tl-sm"
                    }`}>
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-muted-foreground mt-1 opacity-50 px-1">
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </div>
                </motion.div>
              ))}
              {sendMessageMutation.isPending && (
                <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start gap-3">
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

      {/* Input */}
      <div className="sticky bottom-0 p-4 bg-background/80 backdrop-blur-xl border-t border-white/5">
        <form id="chat-form" onSubmit={handleSend} className="max-w-4xl mx-auto flex items-end gap-2">
          <div className="relative flex-1">
            <Input
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="Message AuraShield..."
              className="bg-white/5 border-white/10 focus-visible:ring-primary/50 rounded-2xl py-6 pl-4 pr-12 text-base"
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
        <AlertDialogContent className="glass-card border-destructive/30 max-w-sm">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-destructive flex items-center gap-2">
              <ShieldAlert className="w-6 h-6" /> SOS Alert Sent
            </AlertDialogTitle>
            <AlertDialogDescription className="text-gray-300">
              Emergency protocol activated. Stay in a well-lit, public area.
            </AlertDialogDescription>
          </AlertDialogHeader>

          {sosContacts.length > 0 && (
            <div className="space-y-2 my-2">
              <p className="text-xs text-muted-foreground uppercase tracking-wider font-heading">Call your contacts now</p>
              {sosContacts.map((c, i) => (
                <a
                  key={i}
                  href={`tel:${c.phone}`}
                  className="flex items-center gap-3 p-3 rounded-xl bg-red-500/10 border border-red-500/20 hover:bg-red-500/20 transition-colors"
                  data-testid={`link-sos-call-${i}`}
                >
                  <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                    <Phone className="w-4 h-4 text-red-400" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-white">{c.name}</p>
                    <p className="text-xs text-red-400">{c.phone}</p>
                  </div>
                  <Badge variant="outline" className="text-[10px] border-red-500/30 text-red-400">Tap to call</Badge>
                </a>
              ))}
            </div>
          )}

          {sosContacts.length === 0 && (
            <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-lg p-3">
              No emergency contacts saved. Add contacts from the menu for quick access during emergencies.
            </p>
          )}

          <AlertDialogFooter>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-red-600 w-full">
              I Understand — Stay Safe
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Add Contact Dialog */}
      <Dialog open={addContactOpen} onOpenChange={setAddContactOpen}>
        <DialogContent className="glass-card border-white/10 max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-heading flex items-center gap-2 text-primary">
              <UserPlus className="w-5 h-5" /> Add Emergency Contact
            </DialogTitle>
            <DialogDescription className="text-muted-foreground text-sm">
              Add a neighbour or trusted friend who can be called during emergencies.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleAddContact} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="contact-name" className="text-sm text-muted-foreground">Name *</Label>
              <Input
                id="contact-name"
                placeholder="e.g. Sarah (Neighbour)"
                value={newContact.name}
                onChange={(e) => setNewContact((p) => ({ ...p, name: e.target.value }))}
                className="bg-white/5 border-white/10 focus-visible:ring-primary/50"
                required
                data-testid="input-contact-name"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-phone" className="text-sm text-muted-foreground">Phone Number *</Label>
              <Input
                id="contact-phone"
                type="tel"
                placeholder="+1 234 567 8900"
                value={newContact.phone}
                onChange={(e) => setNewContact((p) => ({ ...p, phone: e.target.value }))}
                className="bg-white/5 border-white/10 focus-visible:ring-primary/50 font-mono"
                required
                data-testid="input-contact-phone"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="contact-relation" className="text-sm text-muted-foreground">Relation</Label>
              <Input
                id="contact-relation"
                placeholder="e.g. Neighbour, Friend, Mom"
                value={newContact.relation}
                onChange={(e) => setNewContact((p) => ({ ...p, relation: e.target.value }))}
                className="bg-white/5 border-white/10 focus-visible:ring-primary/50"
                data-testid="input-contact-relation"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              {3 - contacts.length} contact slot{3 - contacts.length !== 1 ? "s" : ""} remaining
            </p>
            <DialogFooter className="gap-2">
              <Button type="button" variant="ghost" onClick={() => setAddContactOpen(false)} className="flex-1">
                Cancel
              </Button>
              <Button
                type="submit"
                className="flex-1 bg-primary hover:bg-primary/80"
                disabled={!newContact.name.trim() || !newContact.phone.trim() || addContactMutation.isPending}
                data-testid="button-save-contact"
              >
                {addContactMutation.isPending ? "Saving..." : "Save Contact"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
