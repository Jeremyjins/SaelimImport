import { Form, useActionData, useNavigation } from "react-router";
import type { Route } from "./+types/_auth.login";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "~/components/ui/card";
import { Button } from "~/components/ui/button";
import { Input } from "~/components/ui/input";
import { Label } from "~/components/ui/label";
import { loginAction, loginLoader } from "~/loaders/auth.server";

export const loader = loginLoader;
export const action = loginAction;

export default function LoginPage() {
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-xl font-bold text-zinc-900">GV International</h1>
          <p className="mt-1 text-sm text-zinc-500">수입관리 시스템</p>
        </div>

        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="text-lg">로그인</CardTitle>
            <CardDescription>계정 정보를 입력해 주세요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Form method="post" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">이메일</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  placeholder="admin@gvinternational.com"
                  required
                  autoComplete="email"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">비밀번호</Label>
                <Input
                  id="password"
                  name="password"
                  type="password"
                  placeholder="••••••••"
                  required
                  autoComplete="current-password"
                />
              </div>

              {actionData?.error && (
                <p className="text-sm text-destructive">{actionData.error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isSubmitting}
              >
                {isSubmitting ? "로그인 중..." : "로그인"}
              </Button>
            </Form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
