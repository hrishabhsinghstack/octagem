import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { addMedia, removeMedia, setPrimaryMedia } from "@/lib/api/inventoryApi";
import { MediaStorageError, processItemPhoto } from "@/lib/media";
import { showError, showSuccess } from "@/lib/utils";
import type { InventoryItem, MediaKind } from "@/types/inventory";
import { Star, Trash2, Upload, Video as VideoIcon, X } from "lucide-react";
import { useRef, useState } from "react";

const MEDIA_KINDS: MediaKind[] = ["Product Photo", "Certificate", "Stone Photo", "Appraisal"];

interface ItemMediaPanelProps {
  item: InventoryItem;
  onChanged: () => void;
}

export function ItemMediaPanel({ item, onChanged }: ItemMediaPanelProps) {
  const [kind, setKind] = useState<MediaKind>("Product Photo");
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string | null>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setUploading(true);
    try {
      const dataUrl = await processItemPhoto(file);
      await addMedia(item.id, kind, dataUrl, file.name);
      showSuccess("Uploaded", `${file.name} added as ${kind}.`);
      onChanged();
    } catch (error: any) {
      const message = error instanceof MediaStorageError ? error.message : error?.message || "Could not upload that file.";
      showError("Upload failed", message);
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (assetId: string) => {
    await removeMedia(item.id, assetId);
    onChanged();
  };

  const handleSetPrimary = async (assetId: string) => {
    await setPrimaryMedia(item.id, assetId);
    onChanged();
  };

  const handleVideoChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(URL.createObjectURL(file));
    setVideoName(file.name);
  };

  const handleRemoveVideo = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoName(null);
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle className="text-base">Photos &amp; Documents</CardTitle>
          <div className="flex items-center gap-2">
            <Select value={kind} onValueChange={(v) => setKind(v as MediaKind)}>
              <SelectTrigger className="w-40 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MEDIA_KINDS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {k}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <input ref={fileInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFileChange} />
            <Button size="sm" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
              <Upload className="h-3.5 w-3.5 mr-1.5" /> {uploading ? "Uploading…" : "Upload"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {item.media.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No photos yet. Upload a product photo, certificate scan, stone close-up, or appraisal document.
            </p>
          ) : (
            <div className="grid grid-cols-4 gap-3">
              {item.media.map((asset) => (
                <div key={asset.id} className="group relative rounded-md border overflow-hidden">
                  <img src={asset.dataUrl} alt={asset.fileName} className="w-full h-28 object-cover" />
                  <div className="absolute top-1 left-1">
                    <Badge variant={asset.isPrimary ? "default" : "outline"} className="text-[10px] px-1.5 py-0">
                      {asset.kind}
                    </Badge>
                  </div>
                  <div className="absolute top-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => handleSetPrimary(asset.id)}
                      title="Set as primary"
                      className="h-6 w-6 rounded-full bg-background/90 border flex items-center justify-center hover:bg-background"
                    >
                      <Star className={asset.isPrimary ? "h-3 w-3 fill-amber-400 text-amber-400" : "h-3 w-3 text-muted-foreground"} />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemove(asset.id)}
                      title="Remove"
                      className="h-6 w-6 rounded-full bg-background/90 border flex items-center justify-center hover:bg-destructive hover:text-destructive-foreground"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                  {asset.isPrimary && (
                    <div className="absolute bottom-1 left-1">
                      <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Video</CardTitle>
        </CardHeader>
        <CardContent>
          {videoUrl ? (
            <div className="space-y-2">
              <video src={videoUrl} controls className="w-full max-h-72 rounded-md border bg-black" />
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground">{videoName}</span>
                <Button variant="ghost" size="sm" onClick={handleRemoveVideo}>
                  <X className="h-3.5 w-3.5 mr-1" /> Remove
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center gap-2 py-8 border border-dashed rounded-md">
              <VideoIcon className="h-6 w-6 text-muted-foreground" />
              <input ref={videoInputRef} type="file" accept="video/*" className="hidden" onChange={handleVideoChange} />
              <Button size="sm" variant="outline" onClick={() => videoInputRef.current?.click()}>
                <Upload className="h-3.5 w-3.5 mr-1.5" /> Upload video
              </Button>
            </div>
          )}
          <p className="text-xs text-muted-foreground mt-3">
            Video plays for this browser session only — it isn't saved on refresh. Persistent video storage arrives with the real backend (OCTAGEM-BLUEPRINT.md §34.2, object storage).
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
