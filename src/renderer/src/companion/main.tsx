import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '../styles/app.css'
import { Companion } from './Companion'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Companion />
  </StrictMode>
)
