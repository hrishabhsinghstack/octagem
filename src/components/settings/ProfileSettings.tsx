import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { useEffect, useState } from "react";
import { getUserProfile, updateUserProfile } from "@/lib/api/settingsApi";
import { showSuccess } from "@/lib/utils";
import type { UserProfile } from "@/types/settings";

export function ProfileSettings() {
  const [profile, setProfile] = useState<UserProfile>({ firstName: "", lastName: "", email: "", phone: "" });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getUserProfile().then(setProfile);
  }, []);

  const set = (field: keyof UserProfile) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setProfile((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSave = async () => {
    setSaving(true);
    await updateUserProfile(profile);
    setSaving(false);
    showSuccess("Success", "Profile settings updated successfully");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Profile Settings</h2>
        <p className="text-muted-foreground mt-1">Manage your personal information and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Personal Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="firstName">First Name</Label>
              <Input id="firstName" value={profile.firstName} onChange={set("firstName")} placeholder="Enter first name" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="lastName">Last Name</Label>
              <Input id="lastName" value={profile.lastName} onChange={set("lastName")} placeholder="Enter last name" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={profile.email} onChange={set("email")} placeholder="Enter email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="phone">Phone</Label>
            <Input id="phone" value={profile.phone} onChange={set("phone")} placeholder="Enter phone" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Security</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Button type="button" variant="outline" disabled>
              Change Password
            </Button>
            <Button type="button" variant="outline" disabled>
              Enable Two-Factor Authentication
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Available once account security is backed by the API.</p>
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button onClick={handleSave} disabled={saving}>
          {saving ? "Saving..." : "Save Changes"}
        </Button>
      </div>
    </div>
  );
}
