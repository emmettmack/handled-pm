// Sign-in wrapper, used only when a Clerk publishable key is configured (the hosted app). Local development and
// the static demo render <App /> directly, with no login.
import { ClerkProvider, SignedIn, SignedOut, SignIn, UserButton } from '@clerk/clerk-react';
import App from './App.jsx';

const look = { variables: { colorPrimary: '#5b45e8', fontFamily: 'Geist, -apple-system, sans-serif', borderRadius: '10px' } };

export default function AuthRoot({ publishableKey }) {
  return (
    <ClerkProvider publishableKey={publishableKey} appearance={look}>
      <SignedIn><App accountSlot={<UserButton afterSignOutUrl="/" />} /></SignedIn>
      <SignedOut>
        <div className="signin-page">
          <a className="signin-brand" href="https://macalisto.com"><div className="brand-mark"><span>&#10003;</span></div> Macalisto</a>
          <SignIn routing="hash" />
        </div>
      </SignedOut>
    </ClerkProvider>
  );
}
