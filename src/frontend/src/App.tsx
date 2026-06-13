import './i18n/i18n';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ThemeProvider } from '@mui/material/styles';
import CssBaseline from '@mui/material/CssBaseline';
import CookieBanner from './components/CookieBanner';
import Layout from './components/Layout/Layout';
import ScrollToTop from './components/ScrollToTop';
import { ErrorBoundary } from './components/ErrorBoundary';
import ProtectedRoute from './components/ProtectedRoute';
import { AuthProvider } from './contexts/AuthContext';
import { LanguageProvider } from './contexts/LanguageContext';
import AuthCallback from './pages/AuthCallback';
import GardenDetail from './pages/GardenDetail';
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
import Terms from './pages/Terms';
import theme from './theme';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <LanguageProvider>
        <ErrorBoundary>
          <AuthProvider>
            <BrowserRouter>
              <ScrollToTop />
              <Layout>
                <Routes>
                  <Route path="/" element={<Home />} />
                  <Route path="/auth/callback" element={<AuthCallback />} />
                  <Route path="/login" element={<Login />} />
                  <Route path="/register" element={<Register />} />
                  <Route path="/library/:id" element={<PlantDetail />} />
                  <Route path="/library" element={<PlantLibrary />} />
                  <Route path="/legal-notice" element={<LegalNotice />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route element={<ProtectedRoute />}>
                    <Route path="/gardens" element={<MyGardens />} />
                    <Route path="/gardens/:id" element={<GardenDetail />} />
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
          </AuthProvider>
        </ErrorBoundary>
      </LanguageProvider>
    </ThemeProvider>
  );
}
