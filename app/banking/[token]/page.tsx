"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { validateBankingAccess, submitBankingInfo, BankingAccessData } from "./actions";
import { CheckCircle, AlertTriangle, Building2, Lock } from "lucide-react";

export const dynamic = "force-dynamic"

export default function BankingPortalPage() {
  const params = useParams();
  const token = params.token as string;

  const [loading, setLoading] = useState(true);
  const [access, setAccess] = useState<BankingAccessData | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [bankName, setBankName] = useState("");
  const [accountHolderName, setAccountHolderName] = useState("");
  const [routingNumber, setRoutingNumber] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [confirmAccountNumber, setConfirmAccountNumber] = useState("");
  const [accountType, setAccountType] = useState("");

  useEffect(() => {
    const validate = async () => {
      try {
        const result = await validateBankingAccess(token);
        setAccess(result);
        if (result.alreadySubmitted) {
          setSubmitted(true);
        }
      } catch (err) {
        console.error("Failed to validate access:", err);
        setAccess({ valid: false });
      } finally {
        setLoading(false);
      }
    };
    validate();
  }, [token]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (accountNumber !== confirmAccountNumber) {
      setError("Account numbers do not match");
      return;
    }

    if (routingNumber.length !== 9) {
      setError("Routing number must be 9 digits");
      return;
    }

    setSubmitting(true);
    try {
      const result = await submitBankingInfo(token, {
        bankName,
        accountHolderName,
        routingNumber,
        accountNumber,
        accountType,
      });

      if (result.success) {
        setSubmitted(true);
      } else {
        setError(result.error || "Failed to submit");
      }
    } catch (err) {
      setError("An error occurred. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-muted-foreground">Loading...</div>
      </div>
    );
  }

  if (!access?.valid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <AlertTriangle className="h-12 w-12 text-destructive mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">
              {access?.expired ? "Link Expired" : "Invalid Link"}
            </h2>
            <p className="text-muted-foreground">
              {access?.expired
                ? "This banking information link has expired. Please contact us for a new link."
                : "This link is not valid. Please check the URL or contact us for assistance."}
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Information Submitted</h2>
            <p className="text-muted-foreground">
              Thank you! Your banking information has been securely submitted. You can close this page.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-md mx-auto">
        <Card>
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="p-3 rounded-full bg-primary/10">
                <Building2 className="h-8 w-8 text-primary" />
              </div>
            </div>
            <CardTitle>Banking Information</CardTitle>
            <CardDescription>
              Hi {access.personName}, please provide your ACH banking details for direct deposit payments.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex items-start gap-2 text-xs text-muted-foreground mb-6 p-3 rounded-lg bg-muted/50">
              <Lock className="h-4 w-4 mt-0.5 shrink-0" />
              <span>All sensitive banking data (routing and account numbers) are encrypted using AES-256-GCM before storage. Your information is never stored in plain text.</span>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <Label htmlFor="bankName">Bank Name</Label>
                <Input
                  id="bankName"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="e.g., Chase, Bank of America"
                  required
                />
              </div>

              <div>
                <Label htmlFor="accountHolderName">Account Holder Name</Label>
                <Input
                  id="accountHolderName"
                  value={accountHolderName}
                  onChange={(e) => setAccountHolderName(e.target.value)}
                  placeholder="Name as it appears on the account"
                  required
                />
              </div>

              <div>
                <Label htmlFor="accountType">Account Type</Label>
                <Select value={accountType} onValueChange={setAccountType} required>
                  <SelectTrigger>
                    <SelectValue placeholder="Select account type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="checking">Checking</SelectItem>
                    <SelectItem value="savings">Savings</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="routingNumber">Routing Number (9 digits)</Label>
                <Input
                  id="routingNumber"
                  value={routingNumber}
                  onChange={(e) => setRoutingNumber(e.target.value.replace(/\D/g, "").slice(0, 9))}
                  placeholder="123456789"
                  maxLength={9}
                  required
                />
              </div>

              <div>
                <Label htmlFor="accountNumber">Account Number</Label>
                <Input
                  id="accountNumber"
                  type="password"
                  value={accountNumber}
                  onChange={(e) => setAccountNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="Enter account number"
                  required
                />
              </div>

              <div>
                <Label htmlFor="confirmAccountNumber">Confirm Account Number</Label>
                <Input
                  id="confirmAccountNumber"
                  value={confirmAccountNumber}
                  onChange={(e) => setConfirmAccountNumber(e.target.value.replace(/\D/g, ""))}
                  placeholder="Re-enter account number"
                  required
                />
              </div>

              {error && (
                <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-lg">
                  {error}
                </div>
              )}

              <Button type="submit" className="w-full" disabled={submitting || !accountType}>
                {submitting ? "Submitting..." : "Submit Banking Information"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground mt-4">
          This information will only be used for payment processing.
        </p>
      </div>
    </div>
  );
}
