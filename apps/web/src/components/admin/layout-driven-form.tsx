"use client";

import * as React from "react";
import { objectManagerApi } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";

interface LayoutSection {
  name: string;
  fields: string[];
}

interface LayoutField {
  name: string;
  label: string;
  fieldType: string;
  required: boolean;
  editable: boolean;
  visible: boolean;
  isSystemField: boolean;
  isStandardField: boolean;
  defaultValue?: string;
  lookupObject?: string;
  lookupField?: string;
  picklistValues?: { label: string; value: string; isActive: boolean }[];
  minLength?: number;
  maxLength?: number;
  minValue?: number;
  maxValue?: number;
}

interface LayoutDrivenFormProps {
  objectName: string;
  mode: "create" | "edit" | "detail";
  data?: Record<string, any>;
  onChange?: (field: string, value: any) => void;
  onSubmit?: (data: Record<string, any>) => void;
  layout?: any;
  fields?: any[];
  fieldErrors?: Record<string, string>;
}

export default function LayoutDrivenForm({
  objectName,
  mode,
  data = {},
  onChange,
  onSubmit,
  layout: propLayout,
  fields: propFields,
  fieldErrors,
}: LayoutDrivenFormProps) {
  const [layout, setLayout] = React.useState<any>(propLayout || null);
  const [fields, setFields] = React.useState<LayoutField[]>(propFields || []);
  const [isLoading, setIsLoading] = React.useState(!propLayout);
  const [lookupOptions, setLookupOptions] = React.useState<Record<string, any[]>>({});

  React.useEffect(() => {
    if (propLayout && propFields) return;
    loadData();
  }, [objectName, propLayout, propFields]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      const [layoutRes, fieldsRes] = await Promise.all([
        objectManagerApi.getDefaultLayout(objectName),
        objectManagerApi.listFields(objectName, { includeSystem: true }),
      ]);
      setLayout(layoutRes.data.data);
      setFields(fieldsRes.data.data || []);
    } catch {
      console.error("Failed to load layout");
    } finally {
      setIsLoading(false);
    }
  };

  const sections: LayoutSection[] = React.useMemo(() => {
    if (!layout) return [];
    const raw = typeof layout.sections === "string"
      ? JSON.parse(layout.sections)
      : layout.sections;
    return Array.isArray(raw) ? raw : [];
  }, [layout]);

  const getFieldDef = (fieldName: string): LayoutField | undefined =>
    fields.find((f) => f.name === fieldName);

  const handleFieldChange = (fieldName: string, value: any) => {
    if (onChange) onChange(fieldName, value);
  };

  const renderField = (field: LayoutField, value: any) => {
    const isDisabled = mode === "detail" || !field.editable || field.isSystemField;

    switch (field.fieldType) {
      case "text":
      case "autoNumber":
        return (
          <Input
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
            placeholder={field.label}
            maxLength={field.maxLength}
          />
        );

      case "email":
        return (
          <Input
            type="email"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
            placeholder={field.label}
          />
        );

      case "phone":
        return (
          <Input
            type="tel"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
            placeholder={field.label}
          />
        );

      case "url":
        return (
          <Input
            type="url"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
            placeholder={field.label}
          />
        );

      case "number":
        return (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value ? Number(e.target.value) : null)}
            disabled={isDisabled}
            min={field.minValue}
            max={field.maxValue}
          />
        );

      case "currency":
        return (
          <Input
            type="number"
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value ? Number(e.target.value) : null)}
            disabled={isDisabled}
            min={field.minValue || 0}
            step="0.01"
          />
        );

      case "boolean":
        return (
          <Switch
            checked={!!value}
            onCheckedChange={(checked: boolean) => handleFieldChange(field.name, checked)}
            disabled={isDisabled}
          />
        );

      case "date":
        return (
          <Input
            type="date"
            value={value ? new Date(value).toISOString().split("T")[0] : ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value || null)}
            disabled={isDisabled}
          />
        );

      case "dateTime":
        return (
          <Input
            type="datetime-local"
            value={value ? new Date(value).toISOString().slice(0, 16) : ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value || null)}
            disabled={isDisabled}
          />
        );

      case "picklist":
        return (
          <Select
            value={value || ""}
            onValueChange={(v) => handleFieldChange(field.name, v || null)}
            disabled={isDisabled}
          >
            <SelectTrigger>
              <SelectValue placeholder={`Select ${field.label}`} />
            </SelectTrigger>
            <SelectContent>
              {field.picklistValues
                ?.filter((pv) => pv.isActive)
                .map((pv) => (
                  <SelectItem key={pv.value} value={pv.value}>
                    {pv.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        );

      case "lookup":
        return (
          <Input
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
            placeholder={`Lookup: ${field.lookupObject}`}
          />
        );

      case "longText":
        return (
          <Textarea
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
            rows={3}
            maxLength={field.maxLength}
          />
        );

      default:
        return (
          <Input
            value={value || ""}
            onChange={(e) => handleFieldChange(field.name, e.target.value)}
            disabled={isDisabled}
          />
        );
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="h-5 w-40" />
            </CardHeader>
            <CardContent className="space-y-4">
              {[1, 2].map((j) => (
                <div key={j} className="grid grid-cols-2 gap-4">
                  <Skeleton className="h-10" />
                  <Skeleton className="h-10" />
                </div>
              ))}
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (sections.length === 0) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          No layout configured for this object.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {sections.map((section, sectionIdx) => {
        const visibleFields = section.fields
          .map((fieldName) => getFieldDef(fieldName))
          .filter((f): f is LayoutField => !!f && f.visible !== false);

        if (visibleFields.length === 0) return null;

        return (
          <Card key={sectionIdx}>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {section.name}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                {visibleFields.map((field) => (
                  <div
                    key={field.name}
                    className={`space-y-1.5 ${
                      field.fieldType === "longText" ? "md:col-span-2" : ""
                    }`}
                  >
                    <Label className="text-sm">
                      {field.label}
                      {field.required && mode === "create" && (
                        <span className="text-destructive ml-1">*</span>
                      )}
                    </Label>
                    {renderField(field, data[field.name])}
                    {fieldErrors?.[field.name] && (
                      <p className="text-sm text-destructive" data-testid={`error-${field.name}`}>
                        {fieldErrors[field.name]}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}