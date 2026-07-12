import { useEffect, useState } from 'react';
import { Shield, Smartphone, Copy, CheckCircle } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/stateful-button';
import toast from 'react-hot-toast';

export default function SecuritySettings() {
  const { lockEnabled, setupLock, enableLock, disableLock, getRecoveryCodes, refreshLockStatus } = useAuth();
  const [loading, setLoading] = useState(true);
  const [showSetup, setShowSetup] = useState(false);
  const [qrCode, setQrCode] = useState('');
  const [secret, setSecret] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [verifyToken, setVerifyToken] = useState('');
  const [disableToken, setDisableToken] = useState('');
  const [showRecoveryCodes, setShowRecoveryCodes] = useState(false);
  const [savedCodes, setSavedCodes] = useState<string[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setLoading(false);
  }, []);

  const handleSetup = async () => {
    try {
      const result = await setupLock();
      setQrCode(result.qrCodeDataUrl);
      setSecret(result.secret);
      setRecoveryCodes(result.recoveryCodes);
      setShowSetup(true);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleEnable = async () => {
    if (!verifyToken || verifyToken.length !== 6) {
      toast.error('Enter a 6-digit code');
      return;
    }
    try {
      await enableLock(verifyToken);
      toast.success('App lock enabled');
      setShowSetup(false);
      setVerifyToken('');
      refreshLockStatus();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleDisable = async () => {
    if (!disableToken) {
      toast.error('Enter your TOTP code');
      return;
    }
    try {
      await disableLock(disableToken);
      toast.success('App lock disabled');
      setDisableToken('');
      refreshLockStatus();
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const handleShowRecovery = async () => {
    try {
      const codes = await getRecoveryCodes();
      setSavedCodes(codes);
      setShowRecoveryCodes(true);
    } catch (err: any) {
      toast.error(err.message);
    }
  };

  const copyCodes = () => {
    navigator.clipboard.writeText(savedCodes.join('\n'));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="w-6 h-6 border-2 border-green-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-100 flex items-center gap-2">
          <Shield className="w-6 h-6 text-minecraft-400" />
          App Lock
        </h1>
        <p className="text-gray-500 text-sm mt-1">
          Protect your app with Google Authenticator (TOTP)
        </p>
      </div>

      <div className="card p-6">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-gray-200">App Lock Status</h3>
            <p className="text-xs text-gray-500 mt-1">
              {lockEnabled ? 'Enabled — app requires TOTP code to access' : 'Disabled — app opens directly'}
            </p>
          </div>
          <div className={`px-3 py-1 rounded-full text-xs font-medium ${lockEnabled ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-gray-500/10 text-gray-400 border border-gray-500/20'}`}>
            {lockEnabled ? 'Enabled' : 'Disabled'}
          </div>
        </div>

        {!lockEnabled && !showSetup && (
          <div className="mt-4">
            <Button onClick={handleSetup} className="btn-primary">
              <Smartphone className="w-4 h-4 mr-2" />
              Enable App Lock
            </Button>
          </div>
        )}

        {showSetup && (
          <div className="mt-4 space-y-4">
            <div className="text-center">
              <p className="text-sm text-gray-300 mb-3">Scan this QR code with Google Authenticator</p>
              {qrCode && (
                <img src={qrCode} alt="TOTP QR Code" className="w-48 h-48 mx-auto bg-white p-2 rounded-lg" />
              )}
              <p className="text-xs text-gray-500 mt-2">Or enter this secret manually:</p>
              <p className="text-xs font-mono text-gray-300 bg-surface-800 px-3 py-1 rounded mt-1 inline-block">{secret}</p>
            </div>

            <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-lg p-3">
              <p className="text-xs text-yellow-400 font-medium">Save these recovery codes somewhere safe!</p>
              <div className="grid grid-cols-4 gap-2 mt-2">
                {recoveryCodes.map((code, i) => (
                  <span key={i} className="text-xs font-mono text-gray-300 bg-surface-800 px-2 py-1 rounded text-center">{code}</span>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Enter 6-digit code to verify</label>
              <input
                value={verifyToken}
                onChange={e => setVerifyToken(e.target.value)}
                className="input text-center text-2xl font-mono tracking-widest"
                placeholder="000000"
                maxLength={6}
              />
            </div>

            <div className="flex gap-2">
              <Button onClick={handleEnable} disabled={verifyToken.length !== 6} className="btn-primary flex-1">
                Enable Lock
              </Button>
              <Button onClick={() => { setShowSetup(false); setVerifyToken(''); }} className="btn-secondary">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {lockEnabled && !showSetup && (
          <div className="mt-4 space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-300 mb-1.5">Enter TOTP code to disable</label>
              <input
                value={disableToken}
                onChange={e => setDisableToken(e.target.value)}
                className="input text-center text-2xl font-mono tracking-widest"
                placeholder="000000"
                maxLength={6}
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={handleDisable} disabled={disableToken.length !== 6} className="btn-danger flex-1">
                Disable App Lock
              </Button>
              <Button onClick={handleShowRecovery} className="btn-secondary">
                View Recovery Codes
              </Button>
            </div>
          </div>
        )}
      </div>

      {showRecoveryCodes && (
        <div className="card p-6">
          <h3 className="text-sm font-medium text-gray-200 mb-3">Recovery Codes</h3>
          <div className="grid grid-cols-4 gap-2">
            {savedCodes.map((code, i) => (
              <span key={i} className="text-xs font-mono text-gray-300 bg-surface-800 px-2 py-1 rounded text-center">{code}</span>
            ))}
          </div>
          {savedCodes.length === 0 && (
            <p className="text-xs text-gray-500">No recovery codes remaining</p>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={copyCodes} className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1">
              {copied ? <CheckCircle className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
              {copied ? 'Copied' : 'Copy all'}
            </button>
            <button onClick={() => setShowRecoveryCodes(false)} className="text-xs text-gray-500 hover:text-gray-300">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
