import { useState } from "react";
import { useLocation } from "wouter";
import { Shield } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export default function Login() {
  const [name, setName] = useState("");
  const [, setLocation] = useLocation();
  const { login } = useAuth();

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (name.trim()) {
      login(name.trim());
      setLocation("/chat");
    }
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-background">
      {/* Background Image & Overlay */}
      <div 
        className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat opacity-40"
        style={{ backgroundImage: 'url("/login-bg.png")' }}
      />
      <div className="absolute inset-0 z-0 bg-gradient-to-t from-background via-background/80 to-transparent" />
      <div className="absolute inset-0 z-0 bg-gradient-to-r from-primary/10 via-transparent to-accent/10 mix-blend-overlay" />

      {/* Decorative Neon Elements */}
      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-64 h-64 bg-accent/20 rounded-full blur-[100px] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 w-full max-w-md">
        <div className="text-center mb-10">
          <div className="w-20 h-20 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto mb-6 glass-card neon-glow">
            <Shield className="w-10 h-10 text-primary" />
          </div>
          <h1 className="text-4xl md:text-5xl font-heading font-bold mb-3 neon-text">AuraShield</h1>
          <p className="text-lg text-muted-foreground font-light tracking-wide">
            AI That Remembers. Protects. Adapts.
          </p>
        </div>

        <form onSubmit={handleLogin} className="glass-card p-8 rounded-3xl space-y-6">
          <div className="space-y-2">
            <label htmlFor="name" className="text-sm font-medium text-gray-300 ml-1">
              Who are we protecting today?
            </label>
            <Input
              id="name"
              type="text"
              required
              placeholder="Enter your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="bg-black/20 border-white/10 h-14 text-lg rounded-xl focus-visible:ring-primary/50 focus-visible:border-primary/50 transition-all placeholder:text-gray-600"
              data-testid="input-login-name"
              autoComplete="name"
              autoFocus
            />
          </div>

          <Button 
            type="submit" 
            className="w-full h-14 text-lg font-heading tracking-wide rounded-xl neon-glow bg-primary hover:bg-primary/90 text-white transition-all hover:scale-[1.02] active:scale-[0.98]"
            disabled={!name.trim()}
            data-testid="button-login-submit"
          >
            Enter AuraShield
          </Button>

          <p className="text-xs text-center text-gray-500 mt-4">
            No password required for this demo. Your session is saved locally.
          </p>
        </form>
      </div>
    </div>
  );
}