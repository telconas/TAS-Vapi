import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Phone, PhoneOff, PhoneForwarded } from "lucide-react";
import type { FormState } from "@/hooks/use-call-slot";

interface PhoneInputFormProps {
  form: FormState;
  onFormChange: (v: Partial<FormState>) => void;
  onStartCall: (
    phoneNumber: string,
    prompt: string,
    callerName: string,
    email?: string,
    providerName?: string,
  ) => void;
  onHangUp: () => void;
  onTransfer: () => void;
  isCallActive: boolean;
}

const countryCodes = [
  { code: "+1", country: "US/CA" },
  { code: "+44", country: "UK" },
  { code: "+91", country: "IN" },
  { code: "+86", country: "CN" },
  { code: "+81", country: "JP" },
  { code: "+49", country: "DE" },
  { code: "+33", country: "FR" },
  { code: "+61", country: "AU" },
];

const callerNames = [
  { value: "James Martin", label: "James Martin" },
  { value: "Maryad Thatcher", label: "Mariad Thatcher" },
  { value: "Kara Robbins", label: "Kara Robins" },
  { value: "Benjamin Judy", label: "Ben Judy" },
  { value: "Douglas Pearce", label: "Douglas Pearce" },
  { value: "Robert Rowden", label: "Rob Rowden" },
  { value: "Patricia Jones", label: "Patricia Jones" },
  { value: "Felicia White", label: "Felicia White" },
  { value: "Samantha Carlson", label: "Samantha Carlson" },
];

export const providers = [
  { name: "All Stream", number: "800-360-4467" },
  { name: "Astound", number: "800-427-8686" },
  { name: "ATT", number: "800-321-2000" },
  { name: "Century Link", number: "800-777-9594" },
  { name: "Comcast Business", number: "800-391-3000" },
  { name: "Comcast Premier Central", number: "866-925-9635" },
  { name: "Comcast Premier East", number: "833-847-4249" },
  { name: "Comcast Scheduling", number: "866-347-7357" },
  { name: "Comcast West", number: "866-950-3231" },
  { name: "Comcast Xfinity", number: "800-934-6489" },
  { name: "Cox", number: "866-272-5777" },
  { name: "Direct TV", number: "888-342-7288" },
  { name: "Frontier", number: "800-921-8102" },
  { name: "GoTo Communications", number: "833-851-8340" },
  { name: "Grande Communications", number: "877-881-7575" },
  { name: "Granite", number: "866-847-5500" },
  { name: "Lumen", number: "877‑453‑8353" },
  { name: "MetTel", number: "800-876-9823" },
  { name: "Mood Media", number: "800-345-5000" },
  { name: "Optimum (CableVision)", number: "866-251-4435" },
  { name: "RCN", number: "877-726-7000" },
  { name: "Spectrum Business", number: "866-772-4948" },
  { name: "Spectrum Disconnects", number: "866-833-4292" },
  { name: "Spectrum Enterprise", number: "555-812-2591" },
  { name: "Spectrum Residential", number: "888-892-2253" },
  { name: "Spectrum Scheduling", number: "888-681-8943" },
  { name: "ATT U-verse", number: "888-288-8339" },
  { name: "Verizon Enterprise", number: "888-622-0255" },
];

export function PhoneInputForm({
  form,
  onFormChange,
  onStartCall,
  onHangUp,
  onTransfer,
  isCallActive,
}: PhoneInputFormProps) {
  const handleProviderSelect = (value: string) => {
    if (value) {
      const provider = providers.find((p) => p.number === value);
      if (provider) {
        const cleanNumber = provider.number.replace(/\D/g, "");
        onFormChange({ selectedProvider: value, phoneNumber: cleanNumber });
        return;
      }
    }
    onFormChange({ selectedProvider: value });
  };

  const handleStartCall = () => {
    const fullNumber = `${form.countryCode}${form.phoneNumber}`;
    const provider = providers.find((p) => p.number === form.selectedProvider);
    onStartCall(fullNumber, form.prompt, form.callerName, form.email || undefined, provider?.name);
  };

  const isValid = form.phoneNumber.length >= 10 && form.prompt.trim().length > 0;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label htmlFor="caller-name" className="text-base font-medium">
            Caller Name
          </Label>
          <button
            type="button"
            onClick={() => {
              const next = !form.useCustomName;
              onFormChange({ useCustomName: next, callerName: next ? "" : "James Martin" });
            }}
            className="text-sm text-primary hover:underline"
            disabled={isCallActive}
            data-testid="button-toggle-custom-name"
          >
            {form.useCustomName ? "Use preset names" : "Type custom name"}
          </button>
        </div>
        {form.useCustomName ? (
          <Input
            id="caller-name"
            value={form.callerName}
            onChange={(e) => onFormChange({ callerName: e.target.value })}
            placeholder="Enter caller name"
            className="w-full bg-card border-card-border"
            disabled={isCallActive}
            data-testid="input-caller-name"
          />
        ) : (
          <Select
            value={form.callerName}
            onValueChange={(v) => onFormChange({ callerName: v })}
            disabled={isCallActive}
          >
            <SelectTrigger
              className="w-full bg-card border-card-border"
              data-testid="select-caller-name"
            >
              <SelectValue placeholder="Select caller name" />
            </SelectTrigger>
            <SelectContent>
              {callerNames.map((name) => (
                <SelectItem
                  key={name.value}
                  value={name.value}
                  data-testid={`option-caller-${name.value.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {name.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <div className="space-y-3">
        <Label htmlFor="prompt" className="text-base font-medium">
          AI Instructions
        </Label>
        <Textarea
          id="prompt"
          placeholder="Paste account information and task specifics. Include account number, PIN, service address, and brief instructions for the agent."
          value={form.prompt}
          onChange={(e) => onFormChange({ prompt: e.target.value })}
          className="min-h-[100px] bg-card border-card-border resize-none"
          disabled={isCallActive}
          data-testid="input-prompt"
        />
      </div>

      <div className="space-y-3">
        <Label htmlFor="provider" className="text-base font-medium">
          Provider (Optional)
        </Label>
        <Select
          value={form.selectedProvider}
          onValueChange={handleProviderSelect}
          disabled={isCallActive}
        >
          <SelectTrigger
            className="w-full bg-card border-card-border"
            data-testid="select-provider"
          >
            <SelectValue placeholder="Select a Provider" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((provider) => (
              <SelectItem
                key={provider.number}
                value={provider.number}
                data-testid={`option-provider-${provider.name.toLowerCase().replace(/\s+/g, "-")}`}
              >
                {provider.name} - {provider.number}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-3">
        <Label htmlFor="phone-number" className="text-base font-medium">
          Phone Number
        </Label>
        <div className="flex gap-3">
          <Select
            value={form.countryCode}
            onValueChange={(v) => onFormChange({ countryCode: v })}
            disabled={isCallActive}
          >
            <SelectTrigger
              className="w-32 bg-card border-card-border"
              data-testid="select-country-code"
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {countryCodes.map((item) => (
                <SelectItem
                  key={item.code}
                  value={item.code}
                  data-testid={`option-country-${item.code}`}
                >
                  {item.code} {item.country}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            id="phone-number"
            type="tel"
            placeholder="5551234567"
            value={form.phoneNumber}
            onChange={(e) => onFormChange({ phoneNumber: e.target.value.replace(/\D/g, ""), selectedProvider: "" })}
            className="flex-1 bg-card border-card-border text-lg font-mono"
            disabled={isCallActive}
            data-testid="input-phone-number"
          />
        </div>
      </div>

      <div className="space-y-3">
        <Label htmlFor="email" className="text-base font-medium">
          Email for Summary (Optional)
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="your@email.com"
          value={form.email}
          onChange={(e) => onFormChange({ email: e.target.value })}
          className="bg-card border-card-border"
          disabled={isCallActive}
          data-testid="input-email"
        />
        <p className="text-sm text-muted-foreground">
          Receive an AI-generated call summary via email after the call
        </p>
      </div>

      {isCallActive ? (
        <div className="flex gap-3">
          <Button
            onClick={onTransfer}
            variant="default"
            size="lg"
            className="flex-1 text-lg"
            data-testid="button-transfer"
          >
            <PhoneForwarded className="w-5 h-5 mr-2" />
            Transfer Call
          </Button>
          <Button
            onClick={onHangUp}
            variant="destructive"
            size="lg"
            className="flex-1 text-lg"
            data-testid="button-hang-up"
          >
            <PhoneOff className="w-5 h-5 mr-2" />
            Hang Up
          </Button>
        </div>
      ) : (
        <Button
          onClick={handleStartCall}
          disabled={!isValid}
          size="lg"
          className="w-full text-lg"
          data-testid="button-start-call"
        >
          <Phone className="w-5 h-5 mr-2" />
          Start Call
        </Button>
      )}
    </div>
  );
}
