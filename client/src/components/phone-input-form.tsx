import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Phone } from "lucide-react";

interface PhoneInputFormProps {
  onStartCall: (phoneNumber: string) => void;
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

export function PhoneInputForm({ onStartCall, isCallActive }: PhoneInputFormProps) {
  const [countryCode, setCountryCode] = useState("+1");
  const [phoneNumber, setPhoneNumber] = useState("");

  const handleStartCall = () => {
    const fullNumber = `${countryCode}${phoneNumber}`;
    onStartCall(fullNumber);
  };

  const isValid = phoneNumber.length >= 10;

  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <Label htmlFor="phone-number" className="text-base font-medium">
          Phone Number
        </Label>
        <div className="flex gap-3">
          <Select value={countryCode} onValueChange={setCountryCode}>
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
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value.replace(/\D/g, ""))}
            className="flex-1 bg-card border-card-border text-lg font-mono"
            disabled={isCallActive}
            data-testid="input-phone-number"
          />
        </div>
      </div>

      <Button
        onClick={handleStartCall}
        disabled={!isValid || isCallActive}
        size="lg"
        className="w-full text-lg"
        data-testid="button-start-call"
      >
        <Phone className="w-5 h-5 mr-2" />
        {isCallActive ? "Call in Progress..." : "Start Call"}
      </Button>
    </div>
  );
}
