'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { callAIAgent, uploadFiles } from '@/lib/aiAgent'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Loader2, Upload, Camera, Search, RefreshCw, Info, AlertCircle, Sparkles } from 'lucide-react'

// ─── Constants ───────────────────────────────────────────────────────────────

const AGENT_ID = '69e8dc72619d368544e83665'

const THEME_VARS = {
  '--background': '30 40% 98%',
  '--foreground': '20 40% 10%',
  '--card': '30 40% 96%',
  '--card-foreground': '20 40% 10%',
  '--primary': '24 95% 53%',
  '--primary-foreground': '0 0% 100%',
  '--secondary': '30 35% 92%',
  '--secondary-foreground': '20 40% 20%',
  '--accent': '12 80% 50%',
  '--accent-foreground': '0 0% 100%',
  '--muted': '30 30% 90%',
  '--muted-foreground': '20 20% 45%',
  '--border': '30 35% 88%',
  '--ring': '24 95% 53%',
  '--radius': '0.875rem',
} as React.CSSProperties

const LOADING_MESSAGES = [
  'Sniffing out your animal...',
  'Looking closely...',
  'Almost got it...',
  'Checking paws and claws...',
  'Consulting the animal experts...',
]

const SAMPLE_RESULT = {
  animal_name: 'Golden Retriever',
  animal_emoji: '\uD83D\uDC36',
  confidence: 'high',
  greeting_message: 'Wow, what a beautiful Golden Retriever! These fluffy friends are one of the most popular dog breeds in the world!',
  fun_fact: 'Golden Retrievers were originally bred in Scotland to retrieve waterfowl during hunting. They love swimming and can spend hours playing in the water!',
  category: 'pet',
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AnimalResult {
  animal_name: string
  animal_emoji: string
  confidence: string
  greeting_message: string
  fun_fact: string
  category: string
}

// ─── Error Boundary ─────────────────────────────────────────────────────────

class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button onClick={() => this.setState({ hasError: false, error: '' })} className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm">Try again</button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseAgentResponse(result: any): AnimalResult | null {
  try {
    let data = result?.response?.result
    if (typeof data === 'string') {
      try { data = JSON.parse(data) } catch { return null }
    }
    if (!data || typeof data !== 'object') return null
    return {
      animal_name: data?.animal_name ?? 'unknown',
      animal_emoji: data?.animal_emoji ?? '',
      confidence: data?.confidence ?? 'low',
      greeting_message: data?.greeting_message ?? '',
      fun_fact: data?.fun_fact ?? '',
      category: data?.category ?? 'other',
    }
  } catch {
    return null
  }
}

function getCategoryColor(category: string) {
  switch (category?.toLowerCase()) {
    case 'pet': return 'bg-blue-100 text-blue-700 border-blue-200'
    case 'farm': return 'bg-green-100 text-green-700 border-green-200'
    case 'wild': return 'bg-amber-100 text-amber-700 border-amber-200'
    default: return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}

function getConfidenceBadge(confidence: string) {
  switch (confidence?.toLowerCase()) {
    case 'high': return 'bg-emerald-100 text-emerald-700 border-emerald-200'
    case 'medium': return 'bg-yellow-100 text-yellow-700 border-yellow-200'
    case 'low': return 'bg-red-100 text-red-700 border-red-200'
    default: return 'bg-gray-100 text-gray-700 border-gray-200'
  }
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function Page() {
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadingMsgIdx, setLoadingMsgIdx] = useState(0)
  const [result, setResult] = useState<AnimalResult | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSample, setShowSample] = useState(false)
  const [activeAgentId, setActiveAgentId] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!loading) return
    const interval = setInterval(() => {
      setLoadingMsgIdx(prev => (prev + 1) % LOADING_MESSAGES.length)
    }, 2000)
    return () => clearInterval(interval)
  }, [loading])

  const handleFile = useCallback((file: File) => {
    if (file.size > 10 * 1024 * 1024) {
      setError('File is too large! Please use an image under 10MB.')
      return
    }
    const validTypes = ['image/jpeg', 'image/png', 'image/webp']
    if (!validTypes.includes(file.type)) {
      setError('Please upload a JPG, PNG, or WEBP image.')
      return
    }
    setError(null)
    setResult(null)
    setImageFile(file)
    const reader = new FileReader()
    reader.onload = (e) => setImagePreview(e.target?.result as string)
    reader.readAsDataURL(file)
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }, [handleFile])

  const handleClassify = async () => {
    if (!imageFile) return
    setLoading(true)
    setError(null)
    setResult(null)
    setLoadingMsgIdx(0)
    setActiveAgentId(AGENT_ID)

    try {
      const uploadResult = await uploadFiles(imageFile)
      if (!uploadResult.success || !uploadResult.asset_ids?.length) {
        setError('Failed to upload the image. Please try again.')
        setLoading(false)
        setActiveAgentId(null)
        return
      }

      const agentResult = await callAIAgent(
        'Identify the animal in this image. Return the animal name, an appropriate emoji, confidence level, an enthusiastic kid-friendly greeting message, a fun fact, and the category (pet/farm/wild/other). If no animal is found, set animal_name to unknown.',
        AGENT_ID,
        { assets: uploadResult.asset_ids }
      )

      if (agentResult.success) {
        const parsed = parseAgentResponse(agentResult)
        if (parsed) {
          setResult(parsed)
        } else {
          setError('Could not understand the response. Please try another picture!')
        }
      } else {
        setError(agentResult.error ?? 'Something went wrong. Please try again!')
      }
    } catch {
      setError('Network error. Please check your connection and try again.')
    } finally {
      setLoading(false)
      setActiveAgentId(null)
    }
  }

  const handleReset = () => {
    setImageFile(null)
    setImagePreview(null)
    setResult(null)
    setError(null)
    setLoading(false)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const displayResult = showSample ? SAMPLE_RESULT : result

  return (
    <ErrorBoundary>
      <div style={THEME_VARS} className="min-h-screen bg-background text-foreground font-sans">
        {/* Gradient background */}
        <div className="fixed inset-0 pointer-events-none" style={{ background: 'linear-gradient(135deg, hsl(30 50% 97%) 0%, hsl(20 45% 95%) 35%, hsl(40 40% 96%) 70%, hsl(15 35% 97%) 100%)' }} />

        <div className="relative z-10 min-h-screen flex flex-col">
          {/* Header */}
          <header className="w-full border-b border-border bg-card/75 backdrop-blur-md">
            <div className="max-w-2xl mx-auto px-4 py-5 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Sparkles className="w-6 h-6 text-primary" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold tracking-tight text-foreground">Animal Spotter</h1>
                  <p className="text-sm text-muted-foreground">Upload a picture and find out what animal it is!</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer">Sample Data</Label>
                <Switch id="sample-toggle" checked={showSample} onCheckedChange={setShowSample} />
              </div>
            </div>
          </header>

          {/* Main */}
          <main className="flex-1 w-full max-w-2xl mx-auto px-4 py-8 flex flex-col gap-6">
            {/* Upload Zone */}
            <Card className="bg-card/75 backdrop-blur-md border-border shadow-lg overflow-hidden">
              <CardContent className="p-6">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f) }}
                />

                {showSample ? (
                  <div className="relative rounded-xl overflow-hidden bg-gradient-to-br from-amber-50 to-orange-100 aspect-video flex items-center justify-center">
                    <div className="text-center">
                      <p className="text-8xl mb-2">{SAMPLE_RESULT.animal_emoji}</p>
                      <p className="text-sm text-muted-foreground font-medium">Sample: Golden Retriever photo</p>
                    </div>
                  </div>
                ) : imagePreview ? (
                  <div className="relative rounded-xl overflow-hidden bg-muted aspect-video flex items-center justify-center">
                    <img src={imagePreview} alt="Uploaded animal" className="w-full h-full object-contain" />
                    {!loading && (
                      <button onClick={handleReset} className="absolute top-3 right-3 bg-foreground/70 text-background rounded-full p-2 hover:bg-foreground/90 transition-colors" aria-label="Remove image">
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                ) : (
                  <div
                    className={`rounded-xl border-2 border-dashed transition-all duration-200 cursor-pointer aspect-video flex flex-col items-center justify-center gap-4 ${isDragging ? 'border-primary bg-primary/5 scale-[1.01]' : 'border-border hover:border-primary/50 hover:bg-muted/50'}`}
                    onClick={() => fileInputRef.current?.click()}
                    onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                  >
                    <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
                      <Camera className="w-8 h-8 text-primary" />
                    </div>
                    <div className="text-center">
                      <p className="text-lg font-semibold text-foreground">Drop your picture here!</p>
                      <p className="text-sm text-muted-foreground mt-1">or click to browse (JPG, PNG, WEBP up to 10MB)</p>
                    </div>
                    <Button variant="outline" size="sm" className="mt-2 gap-2" onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click() }}>
                      <Upload className="w-4 h-4" />
                      Browse Files
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* CTA Button */}
            {!displayResult && !loading && !error && (
              <Button
                size="lg"
                className="w-full text-lg py-6 rounded-xl gap-3 font-semibold shadow-lg transition-all duration-300 hover:scale-[1.02] hover:shadow-xl disabled:opacity-50"
                disabled={!imageFile && !showSample}
                onClick={showSample ? () => setShowSample(true) : handleClassify}
              >
                <Search className="w-5 h-5" />
                What Animal Is This?
              </Button>
            )}

            {/* Loading */}
            {loading && (
              <Card className="bg-card/75 backdrop-blur-md border-border shadow-lg">
                <CardContent className="p-8 flex flex-col items-center gap-4">
                  <Loader2 className="w-12 h-12 text-primary animate-spin" />
                  <p className="text-lg font-medium text-foreground animate-pulse">{LOADING_MESSAGES[loadingMsgIdx]}</p>
                </CardContent>
              </Card>
            )}

            {/* Error */}
            {error && !loading && (
              <Card className="bg-card/75 backdrop-blur-md border-red-200 shadow-lg">
                <CardContent className="p-8 flex flex-col items-center gap-4 text-center">
                  <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                    <AlertCircle className="w-7 h-7 text-red-500" />
                  </div>
                  <div>
                    <p className="text-lg font-semibold text-foreground">Hmm, I can not spot an animal here!</p>
                    <p className="text-sm text-muted-foreground mt-1">{error}</p>
                  </div>
                  <Button variant="outline" className="gap-2 mt-2" onClick={handleReset}>
                    <Camera className="w-4 h-4" />
                    Try Another Picture
                  </Button>
                </CardContent>
              </Card>
            )}

            {/* Result */}
            {displayResult && !loading && (
              <Card className="bg-card/75 backdrop-blur-md border-border shadow-xl overflow-hidden">
                <div className="h-1.5 bg-gradient-to-r from-orange-400 via-red-400 to-orange-400" />
                <CardHeader className="pb-3 pt-6 text-center">
                  <div className="text-6xl mb-3 select-none">{displayResult.animal_emoji || ''}</div>
                  <CardTitle className="text-3xl font-bold text-foreground">{displayResult.animal_name ?? 'Unknown Animal'}</CardTitle>
                  <div className="flex items-center justify-center gap-2 mt-3 flex-wrap">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getCategoryColor(displayResult.category)}`}>
                      {(displayResult.category ?? 'other').toUpperCase()}
                    </span>
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium border ${getConfidenceBadge(displayResult.confidence)}`}>
                      {(displayResult.confidence ?? 'low').toUpperCase()} confidence
                    </span>
                  </div>
                </CardHeader>
                <CardContent className="space-y-5 pb-6">
                  {displayResult.greeting_message && (
                    <div className="bg-primary/5 rounded-xl p-4 border border-primary/10">
                      <p className="text-base text-foreground leading-relaxed">{displayResult.greeting_message}</p>
                    </div>
                  )}

                  {displayResult.fun_fact && (
                    <div className="bg-secondary rounded-xl p-4 border border-border">
                      <div className="flex items-start gap-3">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                          <Info className="w-4 h-4 text-primary" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Fun Fact</p>
                          <p className="text-sm text-foreground leading-relaxed">{displayResult.fun_fact}</p>
                        </div>
                      </div>
                    </div>
                  )}

                  <Button variant="outline" className="w-full gap-2 py-5 text-base rounded-xl" onClick={() => { handleReset(); if (showSample) setShowSample(false) }}>
                    <RefreshCw className="w-4 h-4" />
                    Try Another!
                  </Button>
                </CardContent>
              </Card>
            )}

            {showSample && displayResult && (
              <p className="text-center text-sm text-muted-foreground">Toggle off &quot;Sample Data&quot; and upload your own picture to try it for real!</p>
            )}
          </main>

          {/* Agent Status Footer */}
          <footer className="w-full border-t border-border bg-card/50 backdrop-blur-sm">
            <div className="max-w-2xl mx-auto px-4 py-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${activeAgentId ? 'bg-primary animate-pulse' : 'bg-emerald-500'}`} />
                  <div>
                    <p className="text-xs font-medium text-foreground">Animal Classifier Agent</p>
                    <p className="text-xs text-muted-foreground">Vision-powered animal identification</p>
                  </div>
                </div>
                <Badge variant="outline" className="text-xs">
                  {activeAgentId ? 'Analyzing...' : 'Ready'}
                </Badge>
              </div>
            </div>
          </footer>
        </div>
      </div>
    </ErrorBoundary>
  )
}
