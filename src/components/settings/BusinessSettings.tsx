import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState } from "react";
import { getBusinessProfile, updateBusinessProfile } from "@/lib/api/settingsApi";
import { showSuccess } from "@/lib/utils";
import type { BusinessProfile } from "@/types/settings";

const BUSINESS_TYPES = ["Diamond & Jewelry Wholesale", "Jewelry Retail", "Loose Diamond Trading", "Luxury Watch Dealer"];
const CURRENCIES = ["USD", "INR", "EUR", "GBP"];

export function BusinessSettings() {
  const [business, setBusiness] = useState<BusinessProfile>({
    companyName: "",
    businessType: "",
    address: "",
    city: "",
    state: "",
    zipCode: "",
    currency: "USD",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getBusinessProfile().then(setBusiness);
  }, []);

  const set = (field: keyof BusinessProfile) => (event: React.ChangeEvent<HTMLInputElement>) =>
    setBusiness((prev) => ({ ...prev, [field]: event.target.value }));

  const handleSave = async () => {
    setSaving(true);
    await updateBusinessProfile(business);
    setSaving(false);
    showSuccess("Success", "Business settings updated successfully");
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Business Settings</h2>
        <p className="text-muted-foreground mt-1">Manage your business information and preferences</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Company Information</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="companyName">Company Name</Label>
            <Input id="companyName" value={business.companyName} onChange={set("companyName")} placeholder="Enter company name" />
          </div>

          <div className="space-y-2">
            <Label>Business Type</Label>
            <Select value={business.businessType} onValueChange={(value) => setBusiness((prev) => ({ ...prev, businessType: value }))}>
              <SelectTrigger>
                <SelectValue placeholder="Select business type" />
              </SelectTrigger>
              <SelectContent>
                {BUSINESS_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {type}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Address</Label>
            <Input id="address" value={business.address} onChange={set("address")} placeholder="Enter address" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input id="city" value={business.city} onChange={set("city")} placeholder="Enter city" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input id="state" value={business.state} onChange={set("state")} placeholder="Enter state" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="zipCode">ZIP Code</Label>
              <Input id="zipCode" value={business.zipCode} onChange={set("zipCode")} placeholder="Enter ZIP code" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Base Currency</Label>
            <Select value={business.currency} onValueChange={(value) => setBusiness((prev) => ({ ...prev, currency: value }))}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CURRENCIES.map((code) => (
                  <SelectItem key={code} value={code}>
                    {code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
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
