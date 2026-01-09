import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useState } from 'react'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { ThemeProvider } from './contexts/ThemeContext'
import { KPIProvider } from './contexts/KPIContext'
import { Sidebar } from './components/Sidebar'
import { Header } from './components/Header'
import { ChatBot } from './components/ChatBot'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Dashboard } from './pages/Dashboard'
import { Playbooks } from './pages/Playbooks'
import { Leads } from './pages/Leads'
import { Sequences } from './pages/Sequences'
import { Tasks } from './pages/Tasks'
import { Appointments } from './pages/Appointments'
import { Prospecting } from './pages/Prospecting'
import { SettingsHub } from './pages/Settings/SettingsHub'
import { OnboardingWizard } from './pages/OnboardingWizard'
import { Accounts } from './pages/Accounts'
import { Contacts } from './pages/Contacts'
import { Opportunities } from './pages/Opportunities'
import { Proposals } from './pages/Proposals'
import { SalesFunnels } from './pages/SalesFunnels'
import { AuditLog } from './pages/AuditLog'
import { KPIOverview } from './pages/KPI/KPIOverview'
import { LivePulseDashboard } from './pages/LivePulse/LivePulseDashboard'
import { VisitReports } from './pages/VisitReports'
import { CatalogManager } from './pages/CatalogManager'
import { Orders } from './pages/Orders'
import { Finance } from './pages/Finance'
import { CustomModulePage } from './pages/CustomModulePage'
import { Toaster } from './components/ui/toaster'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, loading } = useAuth()
  
  // Aguardar até que a autenticação seja verificada
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="mb-4">Carregando...</div>
        </div>
      </div>
    )
  }
  
  // Só redirecionar se realmente não estiver autenticado
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />
  }
  
  return <>{children}</>
}

function Layout({ children }: { children: React.ReactNode }) {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="flex h-screen">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="flex flex-1 flex-col overflow-hidden w-full md:w-auto">
        <Header onMenuClick={() => setSidebarOpen(true)} />
        <main className="flex-1 overflow-y-auto p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/onboarding"
        element={
          <ProtectedRoute>
            <OnboardingWizard />
          </ProtectedRoute>
        }
      />
      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Layout>
              <Dashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/playbooks"
        element={
          <ProtectedRoute>
            <Layout>
              <Playbooks />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/leads"
        element={
          <ProtectedRoute>
            <Layout>
              <Leads />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sequences"
        element={
          <ProtectedRoute>
            <Layout>
              <Sequences />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/tasks"
        element={
          <ProtectedRoute>
            <Layout>
              <Tasks />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/appointments"
        element={
          <ProtectedRoute>
            <Layout>
              <Appointments />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/prospecting"
        element={
          <ProtectedRoute>
            <Layout>
              <Prospecting />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/accounts"
        element={
          <ProtectedRoute>
            <Layout>
              <Accounts />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/contacts"
        element={
          <ProtectedRoute>
            <Layout>
              <Contacts />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/opportunities"
        element={
          <ProtectedRoute>
            <Layout>
              <Opportunities />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/proposals"
        element={
          <ProtectedRoute>
            <Layout>
              <Proposals />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/catalog"
        element={
          <ProtectedRoute>
            <Layout>
              <CatalogManager />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/orders"
        element={
          <ProtectedRoute>
            <Layout>
              <Orders />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/finance"
        element={
          <ProtectedRoute>
            <Layout>
              <Finance />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/sales-funnels"
        element={
          <ProtectedRoute>
            <Layout>
              <SalesFunnels />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/audit-log"
        element={
          <ProtectedRoute>
            <Layout>
              <AuditLog />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <Layout>
              <SettingsHub />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/kpi"
        element={
          <ProtectedRoute>
            <Layout>
              <KPIOverview />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/live-pulse"
        element={
          <ProtectedRoute>
            <Layout>
              <LivePulseDashboard />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/visit-reports"
        element={
          <ProtectedRoute>
            <Layout>
              <VisitReports />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route
        path="/custom-module/:moduleId"
        element={
          <ProtectedRoute>
            <Layout>
              <CustomModulePage />
            </Layout>
          </ProtectedRoute>
        }
      />
      <Route path="/" element={<Navigate to="/dashboard" />} />
    </Routes>
  )
}

function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <KPIProvider>
          <BrowserRouter>
            <AppRoutes />
            <Toaster />
            <ChatBot />
          </BrowserRouter>
        </KPIProvider>
      </AuthProvider>
    </ThemeProvider>
  )
}

export default App

