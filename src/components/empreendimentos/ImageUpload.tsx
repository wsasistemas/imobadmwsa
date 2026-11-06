import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useSignedUrls } from "@/hooks/useSignedUrls";
import { toast } from "sonner";
import { Loader2, Trash2, Upload } from "lucide-react";

type Props = {
  value: string[];
  onChange: (paths: string[]) => void;
  folder: "imagens" | "plantas";
  label?: string;
};

const MAX_MB = 5;

export function ImageUpload({ value, onChange, folder, label }: Props) {
  const { usuario } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const { data: urls } = useSignedUrls(value);

  async function handleFiles(files: FileList | null) {
    if (!files || !usuario) return;
    setUploading(true);
    const uploaded: string[] = [];
    for (const file of Array.from(files)) {
      if (file.size > MAX_MB * 1024 * 1024) {
        toast.error(`${file.name}: excede ${MAX_MB} MB`);
        continue;
      }
      const ext = file.name.split(".").pop() ?? "bin";
      const path = `${usuario.imobiliariaId}/${folder}/${crypto.randomUUID()}.${ext}`;
      const { error } = await supabase.storage.from("empreendimentos").upload(path, file, {
        cacheControl: "3600",
        upsert: false,
      });
      if (error) {
        toast.error(`${file.name}: ${error.message}`);
        continue;
      }
      uploaded.push(path);
    }
    if (uploaded.length) onChange([...value, ...uploaded]);
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  }

  async function remove(path: string) {
    await supabase.storage.from("empreendimentos").remove([path]);
    onChange(value.filter((p) => p !== path));
  }

  return (
    <div className="space-y-3">
      {label && <p className="text-sm font-medium">{label}</p>}
      <div className="flex flex-wrap gap-3">
        {value.map((path) => {
          const url = urls?.get(path);
          return (
            <div
              key={path}
              className="group relative h-24 w-32 overflow-hidden rounded-md border bg-muted"
            >
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt="" className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              )}
              <button
                type="button"
                onClick={() => remove(path)}
                className="absolute right-1 top-1 rounded-full bg-background/90 p-1 opacity-0 shadow transition group-hover:opacity-100"
                aria-label="Remover"
              >
                <Trash2 className="h-3.5 w-3.5 text-destructive" />
              </button>
            </div>
          );
        })}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={uploading}
          className="flex h-24 w-32 flex-col items-center justify-center gap-1 rounded-md border-2 border-dashed text-xs text-muted-foreground transition hover:border-primary hover:text-primary disabled:opacity-50"
        >
          {uploading ? (
            <Loader2 className="h-5 w-5 animate-spin" />
          ) : (
            <>
              <Upload className="h-5 w-5" />
              Adicionar
            </>
          )}
        </button>
      </div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept="image/jpeg,image/png,image/webp"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <p className="text-xs text-muted-foreground">
        JPG, PNG ou WebP até {MAX_MB} MB por arquivo.
      </p>
      <div className="hidden">
        <Button />
      </div>
    </div>
  );
}
