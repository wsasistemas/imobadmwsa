import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const MOTIVOS = [
  "Preço",
  "Localização",
  "Sem crédito aprovado",
  "Escolheu concorrente",
  "Perdeu interesse",
  "Sem contato",
  "Outro",
];

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (motivo: string) => void;
};

export function MotivoPerdidoDialog({ open, onOpenChange, onConfirm }: Props) {
  const [motivo, setMotivo] = useState<string>("Preço");
  const [detalhes, setDetalhes] = useState("");

  function submit() {
    const final = detalhes.trim() ? `${motivo} — ${detalhes.trim()}` : motivo;
    onConfirm(final);
    setDetalhes("");
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Motivo da perda</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Motivo</Label>
            <Select value={motivo} onValueChange={setMotivo}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MOTIVOS.map((m) => (
                  <SelectItem key={m} value={m}>
                    {m}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Detalhes (opcional)</Label>
            <Textarea rows={3} value={detalhes} onChange={(e) => setDetalhes(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={submit}>Confirmar perda</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
