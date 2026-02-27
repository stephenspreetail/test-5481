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
app.kubernetes.io/managed-by: kova-helm
kova.dev/instance: {{ .Values.instanceId }}
kova.dev/app-guid: {{ .Values.appGuid }}
kova.dev/app-id: {{ .Values.appId | quote }}
kova.dev/user-id: {{ .Values.userId | quote }}
app: kova-app
{{- end }}

{{/*
Selector labels (subset of common labels for pod matching)
*/}}
{{- define "kova-app.selectorLabels" -}}
kova.dev/instance: {{ .Values.instanceId }}
kova.dev/app-guid: {{ .Values.appGuid }}
{{- end }}
