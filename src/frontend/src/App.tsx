import './i18n/i18n';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import CookieBanner from './components/CookieBanner';
import Layout from './components/Layout/Layout';
import ScrollToTop from './components/ScrollToTop';
import { ErrorBoundary } from './components/ErrorBoundary';
import GuestRoute from './components/GuestRoute';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import { UnitSystemProvider } from './contexts/UnitSystemContext';
import About from './pages/About';
import AuthCallback from './pages/AuthCallback';
import ConfirmEmail from './pages/ConfirmEmail';
import Contact from './pages/Contact';
import ForgotPassword from './pages/ForgotPassword';
import GardenPlanner from './pages/GardenPlanner';
import Home from './pages/Home';
import LegalNotice from './pages/LegalNotice';
import Login from './pages/Login';
import MyGardens from './pages/MyGardens';
import NotFound from './pages/NotFound';
import PlantDetail from './pages/PlantDetail';
import PlantLibrary from './pages/PlantLibrary';
import Privacy from './pages/Privacy';
import Profile from './pages/Profile';
import Register from './pages/Register';
import ResetPassword from './pages/ResetPassword';
import Shop from './pages/Shop';
import Terms from './pages/Terms';
import { ColorModeProvider } from './contexts/ColorModeContext';

export default function App() {
  return (
    <ColorModeProvider>
      <LanguageProvider>
        <ErrorBoundary>
          <AuthProvider>
            <UnitSystemProvider>
              <BrowserRouter>
                <ScrollToTop />
                <Layout>
                  <Routes>
                    <Route path="/" element={<Home />} />
                    <Route path="/about" element={<About />} />
                    <Route path="/contact" element={<Contact />} />
                    <Route path="/shop" element={<Shop />} />
                    <Route path="/auth/callback" element={<AuthCallback />} />
                    {/* Outside GuestRoute on purpose (SMA-31): registration leaves
                        the visitor signed in, so a GuestRoute child would bounce
                        the user who just clicked the link in their mail. */}
                    <Route path="/confirm-email" element={<ConfirmEmail />} />
                    {/* Outside GuestRoute like /confirm-email (SMA-323): reached
                        from an email link, and a still-signed-in visitor must not
                        be bounced to "/". */}
                    <Route path="/reset-password" element={<ResetPassword />} />
                    <Route element={<GuestRoute />}>
                      <Route path="/login" element={<Login />} />
                      <Route path="/register" element={<Register />} />
                      <Route
                        path="/forgot-password"
                        element={<ForgotPassword />}
                      />
                    </Route>
                    <Route path="/library/:id" element={<PlantDetail />} />
                    <Route path="/library" element={<PlantLibrary />} />
                    <Route path="/legal-notice" element={<LegalNotice />} />
                    <Route path="/privacy" element={<Privacy />} />
                    <Route path="/terms" element={<Terms />} />
                    <Route element={<ProtectedRoute />}>
                      <Route path="/gardens" element={<MyGardens />} />
                      <Route
                        path="/gardens/:id/planner"
                        element={<GardenPlanner />}
                      />
                      <Route path="/profile" element={<Profile />} />
                    </Route>
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                </Layout>
                <CookieBanner />
              </BrowserRouter>
            </UnitSystemProvider>
          </AuthProvider>
        </ErrorBoundary>
      </LanguageProvider>
    </ColorModeProvider>
  );
}
