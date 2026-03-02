{{/*
Resource name: {instanceId}-{shortId}
*/}}
{{- define "kova-app.name" -}}
{{ .Values.instanceId }}-{{ .Values.appShortId }}
{{- end }}

{{/*
Common labels applied to all resources
*/}}
{{- define "kova-app.labels" -}}
app: kova-app
app.kubernetes.io/name: kova-app
app.kubernetes.io/instance: {{ include "kova-app.name" . }}
app.kubernetes.io/version: {{ .Values.image.tag | quote }}
app.kubernetes.io/component: app-container
app.kubernetes.io/part-of: kova
app.kubernetes.io/managed-by: kova-helm
kova.dev/instance: {{ .Values.instanceId }}
kova.dev/app-guid: {{ .Values.appGuid }}
kova.dev/app-id: {{ .Values.appId | quote }}
kova.dev/user-id: {{ .Values.userId | quote }}
{{- end }}

{{/*
Selector labels (subset of common labels for pod matching)
*/}}
{{- define "kova-app.selectorLabels" -}}
kova.dev/instance: {{ .Values.instanceId }}
kova.dev/app-guid: {{ .Values.appGuid }}
{{- end }}

{{/*
Service account name
*/}}
{{- define "kova-app.serviceAccountName" -}}
{{ include "kova-app.name" . }}
{{- end }}
