import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { db, auth } from '../lib/firebase';
import { createUserWithEmailAndPassword } from 'firebase/auth';
import { collection, doc, setDoc, query, where, getDocs } from 'firebase/firestore';
import { notifyError, logError } from '../lib/utils';

export function Registration() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [verified, setVerified] = useState(false);
  const [errorState, setErrorState] = useState('');
  
  const error = errorState;
  const setError = (msg: string) => {
    setErrorState(msg);
    if (msg) notifyError(msg);
  };

  const [password, setPassword] = useState('');

  const checkPasswordStrength = (pass: string) => {
    let score = 0;
    if (pass.length >= 8) score++;
    if (pass.match(/[A-Z]/)) score++;
    if (pass.match(/[a-z]/)) score++;
    if (pass.match(/[0-9]/)) score++;
    if (pass.match(/[^A-Za-z0-9]/)) score++;
    return score;
  };

  const passwordScore = checkPasswordStrength(password);

  const getStrengthText = () => {
    if (password.length === 0) return '';
    if (passwordScore < 3) return 'Weak';
    if (passwordScore < 4) return 'Moderate';
    return 'Strong';
  };

  const getStrengthColor = () => {
    if (passwordScore < 3) return 'bg-red-500';
    if (passwordScore < 4) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!verified) return;
    
    if (passwordScore < 3) {
      setError('Please choose a stronger password.');
      return;
    }
    
    setLoading(true);
    setError('');
    const formData = new FormData(e.currentTarget);
    const email = formData.get('email') as string;
    
    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      
      const data = {
        name: formData.get('name'),
        email,
        phone: formData.get('phone'),
        country: formData.get('country'),
        state: formData.get('state'),
        cityAddress: formData.get('cityAddress'),
        createdAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'users', userCredential.user.uid), data);
      
      navigate('/login');
    } catch (err: any) {
      if (err.code === 'auth/email-already-in-use') {
        setError('An account with this email already exists. Please login.');
      } else {
        setError(err.message || 'Failed to register account.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleLoginClick = async (e: React.MouseEvent) => {
    e.preventDefault();
    navigate('/login');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-800">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8 overflow-y-auto max-h-screen">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">Registration</h1>
          <p className="text-slate-500 mt-2 text-sm">Please fill in your details to create an account.</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="name" name="name" label="Name" required />
          <Input id="email" name="email" type="email" label="Email" required />
          <Input id="phone" name="phone" type="tel" label="Phone Number" required />
          <Input id="country" name="country" label="Country" placeholder="Ex: +91 India" required />
          <Input id="state" name="state" label="State" required />
          <Input id="cityAddress" name="cityAddress" label="City and Address" required />
          <div>
            <Input 
              id="password" 
              name="password" 
              type="password" 
              label="Password" 
              required 
              minLength={6} 
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            {password.length > 0 && (
              <div className="mt-2">
                <div className="flex justify-between items-center mb-1">
                  <span className="text-xs font-semibold text-slate-500">Password strength</span>
                  <span className={`text-xs font-bold ${passwordScore < 3 ? 'text-red-500' : passwordScore < 4 ? 'text-yellow-500' : 'text-green-500'}`}>
                    {getStrengthText()}
                  </span>
                </div>
                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex gap-1">
                  <div className={`h-full flex-1 rounded-full ${passwordScore >= 1 ? getStrengthColor() : 'bg-transparent'}`}></div>
                  <div className={`h-full flex-1 rounded-full ${passwordScore >= 2 ? getStrengthColor() : 'bg-transparent'}`}></div>
                  <div className={`h-full flex-1 rounded-full ${passwordScore >= 3 ? getStrengthColor() : 'bg-transparent'}`}></div>
                  <div className={`h-full flex-1 rounded-full ${passwordScore >= 4 ? getStrengthColor() : 'bg-transparent'}`}></div>
                  <div className={`h-full flex-1 rounded-full ${passwordScore >= 5 ? getStrengthColor() : 'bg-transparent'}`}></div>
                </div>
                <p className="text-[10px] text-slate-400 mt-1">Must be at least 8 characters with a mix of letters, numbers, and symbols.</p>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-3 py-2">
            <input
              type="checkbox"
              id="captcha"
              checked={verified}
              onChange={(e) => setVerified(e.target.checked)}
              className="h-5 w-5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              required
            />
            <label htmlFor="captcha" className="text-sm text-slate-700">
              Verify that you are a human
            </label>
          </div>

          <Button type="submit" className="w-full" isLoading={loading} disabled={!verified}>
            Register
          </Button>

          <p className="text-center text-sm text-slate-500 pt-4">
            Already registered? <button type="button" onClick={handleLoginClick} className="text-blue-600 font-bold hover:underline">Login Here</button>
          </p>
        </form>
      </div>
    </div>
  );
}
