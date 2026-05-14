import { useState } from 'react';
import type { FormEvent } from 'react';
import { Cloud, KeyRound, LogIn, RotateCcw, Send, UserPlus } from 'lucide-react';
import { login, register, resetPassword, sendVerificationCode, type AuthTokenResponse } from '../api/netdisk';

interface AuthPageProps {
  onAuthenticated: (token: AuthTokenResponse) => void;
}

type AuthMode = 'login' | 'register' | 'reset';

export function AuthPage({ onAuthenticated }: AuthPageProps) {
  const [mode, setMode] = useState<AuthMode>('login');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [registerTarget, setRegisterTarget] = useState('');
  const [registerCode, setRegisterCode] = useState('');
  const [resetTarget, setResetTarget] = useState('');
  const [resetCode, setResetCode] = useState('');

  async function submitLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = formData(event.currentTarget);
    await run(async () => onAuthenticated(await login({ account: data.account, password: data.password })));
  }

  async function submitRegister(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = formData(event.currentTarget);
    await run(async () =>
      onAuthenticated(
        await register({
          username: data.username,
          password: data.password,
          email: data.target.includes('@') ? data.target : undefined,
          phone: data.target.includes('@') ? undefined : data.target,
          displayName: data.displayName,
          verificationChannel: data.target.includes('@') ? 'email' : 'phone',
          verificationTarget: data.target,
          verificationCode: data.verificationCode
        })
      )
    );
  }

  async function submitReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = formData(event.currentTarget);
    await run(async () => {
      await resetPassword({
        verificationChannel: data.target.includes('@') ? 'email' : 'phone',
        verificationTarget: data.target,
        verificationCode: data.verificationCode,
        newPassword: data.newPassword
      });
      setMode('login');
      setMessage('密码已更新，请重新登录');
    });
  }

  async function requestCode(scene: 'register' | 'reset', target: string, setter: (code: string) => void) {
    if (!target.trim()) {
      setMessage('请先填写邮箱或手机号');
      return;
    }
    await run(async () => {
      const response = await sendVerificationCode({ scene, channel: target.includes('@') ? 'email' : 'phone', target });
      setter(response.devCode || '');
      setMessage(response.devCode ? '验证码已发送，开发环境已自动填入' : '验证码已发送');
    });
  }

  async function run(action: () => Promise<void>) {
    setLoading(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : '请求失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <section className="auth-screen">
      <div className="auth-hero">
        <div className="auth-logo">
          <Cloud size={30} />
        </div>
        <h1>moya矩阵网盘</h1>
        <p>登录后使用网盘、剪辑、传输和设置。文件上传走独立 Electron 网盘链路，剪辑上传链路保持不变。</p>
      </div>

      <div className="auth-card">
        <div className="auth-tabs">
          <button className={mode === 'login' ? 'active' : undefined} type="button" onClick={() => setMode('login')}>
            <LogIn size={16} />
            登录
          </button>
          <button className={mode === 'register' ? 'active' : undefined} type="button" onClick={() => setMode('register')}>
            <UserPlus size={16} />
            注册
          </button>
          <button className={mode === 'reset' ? 'active' : undefined} type="button" onClick={() => setMode('reset')}>
            <KeyRound size={16} />
            找回密码
          </button>
        </div>

        {mode === 'login' ? (
          <form onSubmit={submitLogin}>
            <input name="account" placeholder="用户名 / 邮箱 / 手机号" required />
            <input name="password" type="password" placeholder="密码" required />
            <button className="primary-action" disabled={loading} type="submit">
              <LogIn size={16} />
              登录
            </button>
          </form>
        ) : null}

        {mode === 'register' ? (
          <form onSubmit={submitRegister}>
            <input name="username" placeholder="用户名" required />
            <input name="displayName" placeholder="展示名称" />
            <input name="password" type="password" placeholder="密码" required />
            <div className="inline-field">
              <input name="target" value={registerTarget} onChange={(event) => setRegisterTarget(event.target.value)} placeholder="邮箱或手机号" required />
              <button type="button" onClick={() => requestCode('register', registerTarget, setRegisterCode)}>
                <Send size={15} />
                发送
              </button>
            </div>
            <input name="verificationCode" value={registerCode} onChange={(event) => setRegisterCode(event.target.value)} placeholder="验证码" required />
            <button className="primary-action" disabled={loading} type="submit">
              <UserPlus size={16} />
              注册并登录
            </button>
          </form>
        ) : null}

        {mode === 'reset' ? (
          <form onSubmit={submitReset}>
            <div className="inline-field">
              <input name="target" value={resetTarget} onChange={(event) => setResetTarget(event.target.value)} placeholder="邮箱或手机号" required />
              <button type="button" onClick={() => requestCode('reset', resetTarget, setResetCode)}>
                <Send size={15} />
                发送
              </button>
            </div>
            <input name="verificationCode" value={resetCode} onChange={(event) => setResetCode(event.target.value)} placeholder="验证码" required />
            <input name="newPassword" type="password" placeholder="新密码" required />
            <button className="primary-action" disabled={loading} type="submit">
              <RotateCcw size={16} />
              更新密码
            </button>
          </form>
        ) : null}

        {message ? <div className="auth-message">{message}</div> : null}
      </div>
    </section>
  );
}

function formData(form: HTMLFormElement) {
  return Object.fromEntries(new FormData(form).entries()) as Record<string, string>;
}
