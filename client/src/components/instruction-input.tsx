import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

interface InstructionInputProps {
  onSendInstruction: (instruction: string) => void;
}

export function InstructionInput({ onSendInstruction }: InstructionInputProps) {
  const [instruction, setInstruction] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (instruction.trim()) {
      onSendInstruction(instruction.trim());
      setInstruction("");
    }
  };

  return (
    <Card className="p-4">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold">Silent Instructions</h3>
          <p className="text-xs text-muted-foreground">Guide the AI without caller hearing</p>
        </div>
        
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            data-testid="input-instruction"
            type="text"
            placeholder="Type instructions for the AI agent..."
            value={instruction}
            onChange={(e) => setInstruction(e.target.value)}
            className="flex-1"
          />
          <Button 
            data-testid="button-send-instruction"
            type="submit" 
            size="icon"
            disabled={!instruction.trim()}
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
        
        <p className="text-xs text-muted-foreground">
          These instructions will be added to the AI's context but won't be heard by the caller.
        </p>
      </div>
    </Card>
  );
}
