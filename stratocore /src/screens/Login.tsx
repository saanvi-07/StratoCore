import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Input } from '../components/Input';
import { Button } from '../components/Button';
import { auth, googleProvider, facebookProvider, db } from '../lib/firebase';
import { signInWithPopup, signInWithRedirect, getRedirectResult, signOut, GoogleAuthProvider, RecaptchaVerifier, signInWithPhoneNumber, ConfirmationResult, signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { collection, query, where, getDocs, doc, updateDoc, getDoc, setDoc } from 'firebase/firestore';
import { useAuth, UserProfile } from '../lib/AuthContext';
import { notifyError, logError } from '../lib/utils';

export function Login() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [errorState, setErrorState] = useState('');
  const [message, setMessage] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [isOtpMode, setIsOtpMode] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<ConfirmationResult | null>(null);
  const { loginCustom } = useAuth();

  const error = errorState;
  const setError = (msg: string) => {
    setErrorState(msg);
    if (msg) notifyError(msg);
  };

  useEffect(() => {
    const handleRedirectResult = async () => {
      try {
        setLoading(true);
        const result = await getRedirectResult(auth);
        if (result && result.user) {
          let profile: UserProfile = {
            id: result.user.uid,
            name: result.user.displayName || result.user.email?.split('@')[0] || 'User',
            email: result.user.email || `${result.user.uid}@oauth.auth`,
            phone: result.user.phoneNumber || '',
            country: 'India',
            state: '',
            cityAddress: '',
          };

          if (db) {
            try {
              const userDocRef = doc(db, 'users', result.user.uid);
              const userDoc = await getDoc(userDocRef);
              if (userDoc.exists()) {
                profile = { id: userDoc.id, ...userDoc.data() } as UserProfile;
              } else {
                await setDoc(userDocRef, {
                  name: profile.name,
                  email: profile.email,
                  phone: profile.phone,
                  country: profile.country,
                  state: profile.state,
                  cityAddress: profile.cityAddress,
                  createdAt: new Date().toISOString()
                });
              }
            } catch (err) {
              console.warn("Firestore lookup/create failed during OAuth Redirect Auth:", err);
            }
          }
          loginCustom(profile);
          navigate('/select-service');
        }
      } catch (err: any) {
        if (err.code === 'auth/unauthorized-domain') {
          setError(`Domain not authorized: Please add "${window.location.hostname}" to Firebase Console -> Authentication -> Settings -> Authorized domains.`);
        } else {
          setError(err.message || 'OAuth Redirect sign-in failed.');
        }
      } finally {
        setLoading(false);
      }
    };
    handleRedirectResult();
  }, [auth, db, loginCustom, navigate]);

  const handleEmailLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    
    const formData = new FormData(e.currentTarget);
    const identifier = (formData.get('identifier') as string).trim();
    const password = formData.get('password') as string;
    const confirmPassword = formData.get('confirmPassword') as string;

    if (confirmPassword && password !== confirmPassword) {
      setError('Passwords do not match.');
      setLoading(false);
      return;
    }

    let loginEmail = identifier;
    
    // If identifier doesn't look like an email, assume it's a phone number
    if (!identifier.includes('@')) {
      try {
        const q = query(collection(db, 'users'), where('phone', '==', identifier));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          loginEmail = snapshot.docs[0].data().email;
        } else {
          setError('You must register an account first.');
          setLoading(false);
          return;
        }
      } catch (err) {
        console.warn("Could not lookup phone number:", err);
      }
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, loginEmail, password);
      
      let profile: UserProfile = {
        id: userCredential.user.uid,
        name: userCredential.user.displayName || loginEmail.split('@')[0],
        email: loginEmail,
        phone: '',
        country: 'India',
        state: '',
        cityAddress: '',
      };

      try {
        const userDocRef = doc(db, 'users', userCredential.user.uid);
        const userDoc = await getDoc(userDocRef);
        if (userDoc.exists()) {
          profile = { id: userDoc.id, ...userDoc.data() } as UserProfile;
        } else {
          // fallback query if user saved it without uid
          const q = query(collection(db, 'users'), where('email', '==', loginEmail));
          const snapshot = await getDocs(q);
          if (!snapshot.empty) {
            profile = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() } as UserProfile;
          }
        }
      } catch (err) {
        console.warn("Could not fetch user profile from firestore:", err);
      }

      loginCustom(profile);
      navigate('/select-service');
    } catch (err: any) {
      console.warn("Login error:", err.message);
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential') {
        setError('Invalid credentials. Please make sure you have registered first.');
      } else {
        setError(err.message || 'Login failed.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    
    const formData = new FormData(e.currentTarget);
    const email = formData.get('resetEmail') as string;

    try {
      await sendPasswordResetEmail(auth, email);
      setMessage('Password reset email sent successfully. Please check your inbox.');
      setTimeout(() => setIsResetting(false), 3000);
    } catch (err: any) {
      if (err.code === 'auth/user-not-found') {
        setError('No account found with this email.');
      } else {
        setError(err.message || 'Failed to send password reset email.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setLoading(true);
      setError('');
      setMessage('');
      
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        localStorage.setItem('google_oauth_token', credential.accessToken);
      }
      
      if (result.user.email) {
        let profile: UserProfile = {
          id: result.user.uid,
          name: result.user.displayName || result.user.email.split('@')[0] || 'Google User',
          email: result.user.email,
          phone: result.user.phoneNumber || '',
          country: 'India',
          state: 'Maharashtra',
          cityAddress: '',
        };

        if (db) {
          try {
            const userDocRef = doc(db, 'users', result.user.uid);
            const userDoc = await getDoc(userDocRef);
            if (userDoc.exists()) {
              profile = { id: userDoc.id, ...userDoc.data() } as UserProfile;
            } else {
              // Create user in Firestore
              await setDoc(userDocRef, {
                name: profile.name,
                email: profile.email,
                phone: profile.phone,
                country: profile.country,
                state: profile.state,
                cityAddress: profile.cityAddress,
                createdAt: new Date().toISOString()
              });
            }
          } catch (err) {
            console.warn("Firestore lookup/create failed during Google Auth:", err);
          }
        }

        loginCustom(profile);
      }
      
      navigate('/select-service');
    } catch (err: any) {
      console.warn("Google Auth warning:", err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setError('');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(`Domain not authorized: Please add "${window.location.hostname}" to Firebase Console -> Authentication -> Settings -> Authorized domains.`);
      } else if (err.message?.includes('Cross-Origin') || err.message?.includes('closed') || err.message?.includes('COOP')) {
        // Fallback to redirect if popup is blocked by COOP
        setError('Popup blocked by browser. Redirecting to Google Sign-In...');
        signInWithRedirect(auth, googleProvider).catch((redirectErr) => {
           setError(redirectErr.message || 'Redirect Sign-in failed.');
        });
      } else {
        setError(err.message || 'Google Sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleFacebookSignIn = async () => {
    try {
      setLoading(true);
      setError('');
      setMessage('');
      
      const result = await signInWithPopup(auth, facebookProvider);
      if (result.user) {
        const profile: UserProfile = {
          id: result.user.uid,
          name: result.user.displayName || result.user.email?.split('@')[0] || 'Facebook User',
          email: result.user.email || `${result.user.uid}@facebook.com`,
          phone: result.user.phoneNumber || '',
          country: 'India',
          state: 'Maharashtra',
          cityAddress: '',
        };
        loginCustom(profile);
      }
      navigate('/select-service');
    } catch (err: any) {
      console.warn("Facebook Auth warning:", err);
      if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') {
        setError('');
      } else if (err.code === 'auth/unauthorized-domain') {
        setError(`Domain not authorized: Please add "${window.location.hostname}" to Firebase Console -> Authentication -> Settings -> Authorized domains.`);
      } else if (err.message?.includes('Cross-Origin') || err.message?.includes('closed') || err.message?.includes('COOP')) {
        setError('Popup blocked by browser. Redirecting to Facebook Sign-In...');
        signInWithRedirect(auth, facebookProvider).catch((redirectErr) => {
           setError(redirectErr.message || 'Redirect Sign-in failed.');
        });
      } else {
        setError(err.message || 'Facebook Sign-in failed. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const setupRecaptcha = () => {
    if (!(window as any).recaptchaVerifier) {
      (window as any).recaptchaVerifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible',
        callback: () => {
          // reCAPTCHA solved
        },
      });
    }
  };

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      setupRecaptcha();
      const appVerifier = (window as any).recaptchaVerifier;
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+91${phoneNumber}`;
      
      const confirmation = await signInWithPhoneNumber(auth, formattedPhone, appVerifier);
      setConfirmationResult(confirmation);
      setMessage('OTP sent successfully!');
    } catch (err: any) {
      if (err.code === 'auth/unauthorized-domain') {
        setError(`Domain not authorized: Please add "${window.location.hostname}" to Firebase Console -> Authentication -> Settings -> Authorized domains.`);
      } else {
        setError(err.message || 'Failed to send OTP. Ensure the phone number is in format +91XXXXXXXXXX.');
      }
      if ((window as any).recaptchaVerifier) {
        (window as any).recaptchaVerifier.clear();
        (window as any).recaptchaVerifier = null;
      }
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!confirmationResult) return;
    
    setLoading(true);
    setError('');
    try {
      const result = await confirmationResult.confirm(otpCode);
      let profile: UserProfile = {
        id: result.user.uid,
        name: result.user.phoneNumber || 'User',
        email: `${result.user.uid}@phone.auth`,
        phone: result.user.phoneNumber || '',
        country: 'India',
        state: '',
        cityAddress: '',
      };
      
      if (db) {
        try {
          const userDocRef = doc(db, 'users', result.user.uid);
          const userDoc = await getDoc(userDocRef);
          if (userDoc.exists()) {
            profile = { id: userDoc.id, ...userDoc.data() } as UserProfile;
          } else {
            await setDoc(userDocRef, {
              name: profile.name,
              email: profile.email,
              phone: profile.phone,
              country: profile.country,
              state: profile.state,
              cityAddress: profile.cityAddress,
              createdAt: new Date().toISOString()
            });
          }
        } catch (err) {
          console.warn("Firestore lookup/create failed during OTP Auth:", err);
        }
      }

      loginCustom(profile);
      navigate('/select-service');
    } catch (err: any) {
      setError(err.message || 'Invalid OTP.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4 font-sans text-slate-800">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold text-slate-900">{isResetting ? 'Reset Password' : 'Login'}</h1>
          <p className="text-slate-500 mt-2 text-sm">{isResetting ? 'Enter your registered email and a new password' : 'Welcome back to your account'}</p>
        </div>

        {error && (
          <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg border border-red-100">
            {error}
          </div>
        )}
        
        {message && (
          <div className="mb-4 p-3 bg-green-50 text-green-700 text-sm rounded-lg border border-green-100">
            {message}
          </div>
        )}

        {isResetting ? (
          <form onSubmit={handleResetPassword} className="space-y-4">
            <Input id="resetEmail" name="resetEmail" type="email" label="Registered Email" required />
            <Button type="submit" className="w-full" isLoading={loading}>
              Reset Password
            </Button>
            <div className="text-center pt-2">
              <button type="button" onClick={() => {setIsResetting(false); setError(''); setMessage('');}} className="text-sm text-blue-600 hover:underline">
                Back to Login
              </button>
            </div>
          </form>
        ) : isOtpMode ? (
          <div className="space-y-4">
            {!confirmationResult ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <Input 
                  id="phoneNumber" 
                  name="phoneNumber" 
                  label="Phone Number (e.g. +919876543210)" 
                  required 
                  value={phoneNumber}
                  onChange={(e: any) => setPhoneNumber(e.target.value)}
                />
                <Button type="submit" className="w-full" isLoading={loading}>
                  Send OTP
                </Button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <Input 
                  id="otpCode" 
                  name="otpCode" 
                  label="Enter OTP" 
                  required 
                  value={otpCode}
                  onChange={(e: any) => setOtpCode(e.target.value)}
                />
                <Button type="submit" className="w-full" isLoading={loading}>
                  Verify OTP
                </Button>
              </form>
            )}
            <div className="text-center pt-2">
              <button type="button" onClick={() => {setIsOtpMode(false); setError(''); setMessage(''); setConfirmationResult(null);}} className="text-sm text-blue-600 hover:underline">
                Back to Email Login
              </button>
            </div>
            <div id="recaptcha-container"></div>
          </div>
        ) : (
          <>
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <Input id="identifier" name="identifier" label="Email OR Phone Number" required />
              <Input id="password" name="password" type="password" label="Password" required />
              <Input id="confirmPassword" name="confirmPassword" type="password" label="Confirm Password" />

              <div className="flex justify-end">
                <button type="button" onClick={() => {setIsResetting(true); setError(''); setMessage('');}} className="text-sm font-medium text-blue-600 hover:underline">
                  Forgot Password?
                </button>
              </div>

              <Button type="submit" className="w-full" isLoading={loading}>
                Login
              </Button>
            </form>

            <div className="mt-8 relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-slate-200"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="bg-white px-4 text-slate-500">or</span>
              </div>
            </div>

            <div className="mt-6 space-y-3">
              <Button variant="outline" className="w-full bg-white" onClick={handleGoogleSignIn} type="button">
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google" className="w-5 h-5 mr-3" />
                Sign in with Google
              </Button>
              <Button variant="outline" className="w-full bg-white" type="button" onClick={handleFacebookSignIn}>
                <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/facebook.svg" alt="Facebook" className="w-5 h-5 mr-3" />
                Sign in with Facebook
              </Button>
              <Button variant="outline" className="w-full bg-white" type="button" onClick={() => {setIsOtpMode(true); setError(''); setMessage('');}}>
                Sign in with OTP
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
