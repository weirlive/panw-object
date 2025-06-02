
"use client";

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardCopy, ClipboardCheck, TerminalSquare, Settings2, Edit3, PlusSquare, ListPlus } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

type OperationType = 'rename' | 'create';

export default function PaloAltoForm() {
  const [baseName, setBaseName] = useState<string>('');
  const [tag, setTag] = useState<string>('');
  const [objectType, setObjectType] = useState<string>('HST');
  const [operationType, setOperationType] = useState<OperationType>('create');
  const [objectListInput, setObjectListInput] = useState<string>('');
  const [generatedCommands, setGeneratedCommands] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [addToGroup, setAddToGroup] = useState<boolean>(false);
  const [addressGroupSuffix, setAddressGroupSuffix] = useState<string>('');
  const { toast } = useToast();

  const handleGenerateCommands = (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setGeneratedCommands('');

    if (!baseName.trim()) {
        toast({
            title: "Missing Zone Name",
            description: "Please enter the Zone Name.",
            variant: "destructive",
        });
        setIsLoading(false);
        return;
    }
    if (!objectListInput.trim()) {
        toast({
            title: "Missing Object List/Values",
            description: "Please paste your object list or values.",
            variant: "destructive",
        });
        setIsLoading(false);
        return;
    }

    const lines = objectListInput.split('\n');
    const commandsArray: string[] = [];
    const objectNamesForGroup: string[] = [];
    const effectiveTag = tag.trim() || baseName.trim();

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      let valuePartForNewNameConstruction: string;
      let valuePartForObjectDefinition: string = '';
      let descriptionForNewObject = trimmedLine;
      let originalObjectNameForRename: string | undefined = undefined;

      if (operationType === 'rename') {
        originalObjectNameForRename = trimmedLine;
        valuePartForNewNameConstruction = trimmedLine; // Suffix for new name is derived from original name

        if (!originalObjectNameForRename.trim()) {
          commandsArray.push(`# Skipping RENAME: Empty original name provided: ${trimmedLine}`);
          return;
        }
      } else { // Create operation
        valuePartForNewNameConstruction = trimmedLine;
        valuePartForObjectDefinition = trimmedLine;

        if (!valuePartForObjectDefinition.trim()) {
             commandsArray.push(`# Skipping CREATE: Empty value provided: ${trimmedLine}`);
             return;
        }
      }

      let newName: string;

      if (operationType === 'create') {
        // For create, always use _ as primary separator.
        // Preserve dots in valuePartForNewNameConstruction (e.g. for IPs, FQDNs)
        // by replacing only slashes, spaces, hyphens.
        let formattedValuePart = valuePartForNewNameConstruction
          .replace(/[\/\s-]+/g, '_')
          .replace(/_{2,}/g, '_')
          .replace(/^_+|_+$/g, '');

        if (!formattedValuePart) {
          commandsArray.push(`# Skipping CREATE: Resulting name part is empty after sanitization: ${trimmedLine}`);
          return;
        }
        newName = `${baseName.trim()}_${objectType}_${formattedValuePart}`;
      } else { // rename
        let sanitizedSuffixForRename;
        if (objectType === 'FQDN') {
             // For FQDN rename, valuePartForNewNameConstruction is the FQDN itself.
             // Preserve dots, replace slashes, spaces, hyphens with underscores.
             sanitizedSuffixForRename = valuePartForNewNameConstruction
                .replace(/[\/\s-]+/g, '_') // Preserves dots
                .replace(/_{2,}/g, '_')
                .replace(/^_+|_+$/g, '');
        } else {
            // For other rename types, valuePartForNewNameConstruction is the original name.
            // Replace dots, slashes, spaces, hyphens in it with underscores for the suffix.
            sanitizedSuffixForRename = valuePartForNewNameConstruction
                .replace(/[.\/\s-]+/g, '_') // Replaces dots too
                .replace(/_{2,}/g, '_')
                .replace(/^_+|_+$/g, '');
        }

         if (!sanitizedSuffixForRename) {
          commandsArray.push(`# Skipping RENAME: Resulting name suffix is empty after sanitization: ${trimmedLine} (using suffix derived from: ${valuePartForNewNameConstruction})`);
          return;
        }
        newName = `${baseName.trim()}_${objectType}_${sanitizedSuffixForRename}`;
      }

      newName = newName.toUpperCase();


      if (operationType === 'rename') {
        if (!originalObjectNameForRename) { // Should be caught earlier but good failsafe
             commandsArray.push(`# Skipping RENAME: Could not determine original object name for: ${trimmedLine}`);
             return;
        }
        commandsArray.push(`rename address ${originalObjectNameForRename} to ${newName}`);
        commandsArray.push(`set address ${newName} description "${descriptionForNewObject}"`);
        commandsArray.push(`set address ${newName} tag [ ${effectiveTag.toUpperCase()} ]\n`);
        objectNamesForGroup.push(newName);
      } else { // create
        switch (objectType) {
          case 'HST':
            const hostIp = valuePartForObjectDefinition.includes('/') ? valuePartForObjectDefinition : `${valuePartForObjectDefinition}/32`;
            commandsArray.push(`set address ${newName} ip-netmask ${hostIp}`);
            break;
          case 'SBN':
            commandsArray.push(`set address ${newName} ip-netmask ${valuePartForObjectDefinition}`);
            break;
          case 'ADR':
            commandsArray.push(`set address ${newName} ip-range ${valuePartForObjectDefinition}`);
            break;
          case 'FQDN':
            commandsArray.push(`set address ${newName} fqdn ${valuePartForObjectDefinition}`);
            break;
        }
        commandsArray.push(`set address ${newName} description "${descriptionForNewObject}"`);
        commandsArray.push(`set address ${newName} tag [ ${effectiveTag.toUpperCase()} ]\n`);
        objectNamesForGroup.push(newName);
      }
    });

    if (addToGroup && objectNamesForGroup.length > 0) {
      const sanitizedGroupSuffix = addressGroupSuffix.trim().replace(/[.\/\-\s]+/g, '_');
      const groupNameBase = `${baseName.trim()}_ADG_`;
      const groupName = `${groupNameBase}${sanitizedGroupSuffix ? sanitizedGroupSuffix : ''}`.toUpperCase();

      commandsArray.push(`\n# Address Group Configuration`);
      commandsArray.push(`set address-group ${groupName} static [ ${objectNamesForGroup.join(' ')} ]`);
      if (!addressGroupSuffix.trim()) {
        commandsArray.push(`set address-group ${groupName} description "Address group for ${baseName.trim()}"`);
      } else {
        commandsArray.push(`set address-group ${groupName} description "${addressGroupSuffix.trim()}"`);
      }
      commandsArray.push('');
    }

    setGeneratedCommands(commandsArray.join('\n'));
    setIsLoading(false);
    if (commandsArray.length > 0 && commandsArray.some(cmd => !cmd.startsWith('#'))) {
        toast({
            title: "Commands Generated",
            description: `Your Palo Alto CLI commands are ready.${addToGroup && objectNamesForGroup.length > 0 ? ' Address group configured.' : ''}`,
        });
    } else if (commandsArray.every(cmd => cmd.startsWith('#')) && commandsArray.length > 0) {
        toast({
            title: "No Valid Commands Generated",
            description: "All entries were malformed or skipped.",
            variant: "destructive"
        });
    } else {
         toast({
            title: "No Commands Generated",
            description: "The object list might be empty or all entries were malformed/empty.",
            variant: "destructive"
        });
    }
  };

  const handleCopyToClipboard = async () => {
    if (!generatedCommands) {
        toast({
            title: "Nothing to Copy",
            description: "Generate commands first.",
            variant: "destructive",
        });
        return;
    }
    try {
      await navigator.clipboard.writeText(generatedCommands);
      setIsCopied(true);
      toast({
        title: "Copied to Clipboard!",
        description: "Commands are now in your clipboard.",
      });
      setTimeout(() => setIsCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy: ', err);
      toast({
        title: "Copy Failed",
        description: "Could not copy commands to clipboard. Your browser might not support this feature or permissions are denied.",
        variant: "destructive",
      });
    }
  };

const renamePlaceholderBase =
`# Examples (Original Object Name, one per line):
# MyExistingServer
# CorporateFirewall_Subnet_Internal
# old.fqdn.example.com
#
# Paste one original object name per line.
# This name will be used as the 'from' part of the rename command.
# It will also be sanitized to form the suffix of the new object name:
# ZoneName_ObjectType_SanitizedOriginalName
# (e.g., for FQDNs, 'old.fqdn' suffix becomes 'OLD.FQDN'; for others, 'My.Server' suffix becomes 'MY_SERVER')`;


  const createPlaceholder =
`# Examples (one actual value per line):
# 192.168.1.10 (for Host)
# 10.10.0.0/16 (for Subnet)
# 172.16.1.5-172.16.1.20 (for Address Range)
# www.example.com (for FQDN)
#
# Paste one value per line.
# This value will be used for the object and its description.
# For FQDNs, dots in the value are preserved in the object name suffix.
# New name: ZoneName_ObjectType_SanitizedValue

1.1.1.1
10.20.0.0/24
main.example.com`;

  const getPlaceholder = () => {
    if (operationType === 'rename') {
      return renamePlaceholderBase;
    }
    return createPlaceholder;
  }

  const displaySanitizedSuffix = addressGroupSuffix.trim().replace(/[.\/\-\s]+/g, '_');

  return (
    <Card className="w-full shadow-xl bg-card text-card-foreground">
      <CardHeader>
        <div className="flex items-center space-x-2 mb-2">
          <Settings2 className="h-6 w-6 text-primary" />
          <CardTitle className="font-headline text-2xl text-primary">Configuration</CardTitle>
        </div>
        <CardDescription className="text-card-foreground/80">

        </CardDescription>
      </CardHeader>
      <form onSubmit={handleGenerateCommands}>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="baseName" className="font-semibold text-card-foreground/90">Zone Name</Label>
              <Input
                id="baseName"
                type="text"
                placeholder="e.g., DMZ-External"
                value={baseName}
                onChange={(e) => setBaseName(e.target.value)}
                required
                className="focus:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag" className="font-semibold text-card-foreground/90">Tag (Optional, uses Zone Name if empty)</Label>
              <Input
                id="tag"
                type="text"
                placeholder="e.g., CriticalServer (uses Zone Name if empty)"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                className="focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="font-semibold text-card-foreground/90">Type</Label>
              <Select value={operationType} onValueChange={(value) => setOperationType(value as OperationType)}>
                <SelectTrigger className="w-full focus:ring-ring">
                  <SelectValue placeholder="Select operation type" />
                </SelectTrigger>
                <SelectContent>
                   <SelectItem value="create">
                     <div className="flex items-center">
                      <PlusSquare className="mr-2 h-4 w-4 text-primary/80" /> Create
                    </div>
                  </SelectItem>
                  <SelectItem value="rename">
                    <div className="flex items-center">
                      <Edit3 className="mr-2 h-4 w-4 text-primary/80" /> Rename
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label className="font-semibold text-card-foreground/90">Object Type</Label>
              <Select value={objectType} onValueChange={setObjectType}>
                <SelectTrigger className="w-full focus:ring-ring">
                  <SelectValue placeholder="Select object type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="HST">Host (HST)</SelectItem>
                  <SelectItem value="SBN">Subnet (SBN)</SelectItem>
                  <SelectItem value="ADR">Address Range (ADR)</SelectItem>
                  <SelectItem value="FQDN">FQDN</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="addToGroup"
                checked={addToGroup}
                onCheckedChange={(checked: boolean | 'indeterminate') => setAddToGroup(checked === true)}
              />
              <Label htmlFor="addToGroup" className="font-semibold text-card-foreground/90 flex items-center">
                <ListPlus className="mr-2 h-5 w-5 text-primary/80" />
                Add objects to an Address Group
              </Label>
            </div>
          </div>

          {addToGroup && (
            <div className="space-y-2 pl-7">
              <Label htmlFor="addressGroupSuffix" className="font-semibold text-card-foreground/90">
                Address Group Name Suffix (Optional)
              </Label>
              <Input
                id="addressGroupSuffix"
                type="text"
                placeholder="e.g., WebServers (ZoneName_ADG_WEBSERVERS)"
                value={addressGroupSuffix}
                onChange={(e) => setAddressGroupSuffix(e.target.value)}
                className="focus:ring-ring"
              />
              <p className="text-xs text-muted-foreground">
                Final group name: {`${(baseName.trim() || "[ZoneName]").toUpperCase()}_ADG_${(displaySanitizedSuffix).toUpperCase()}`}{!displaySanitizedSuffix && <span className="italic">(NO SUFFIX)</span>}
              </p>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="objectList" className="font-semibold text-card-foreground/90">
              {operationType === 'rename'
                ? 'Object List (Original Object Name, one per line)'
                : 'Object Values (One value per line)'
              }
            </Label>
            <Textarea
              id="objectList"
              placeholder={getPlaceholder()}
              value={objectListInput}
              onChange={(e) => setObjectListInput(e.target.value)}
              required
              rows={8}
              className="focus:ring-ring font-code text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {operationType === 'rename'
                ? "Format: `OriginalObjectName`. This is the current name of the object. The new name will be `ZoneName_ObjectType_SanitizedOriginalName`. For FQDN Object Type, dots in `SanitizedOriginalName` are preserved (e.g., `old.host.com` becomes `OLD.HOST.COM`); for other Object Types, dots are replaced with underscores (e.g., `Server.1` becomes `SERVER_1`)."
                : "Format: Actual Value (e.g., 1.2.3.4 for Host, 10.0.0.0/16 for Subnet). New name: `ZoneName_ObjectType_SanitizedValue`. For FQDN Object Type, dots in the `SanitizedValue` are preserved in the object name suffix."
              }
              {' '}Value type depends on selected Object Type. Paste one entry per line.
            </p>
          </div>
        </CardContent>
        <CardFooter className="flex flex-col sm:flex-row justify-between items-center pt-6 border-t">
           <Button
            type="submit"
            disabled={isLoading}
            className="w-full sm:w-auto bg-accent hover:bg-accent/90 text-accent-foreground active:scale-95 transition-transform duration-150 ease-in-out"
          >
            {isLoading ? (
              <>
                <svg className="animate-spin -ml-1 mr-3 h-5 w-5" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Generating...
              </>
            ) : (
              <>
                <TerminalSquare className="mr-2 h-5 w-5" />
                Generate Commands
              </>
            )}
          </Button>
          {generatedCommands && (
             <Button
                type="button"
                onClick={handleCopyToClipboard}
                variant="outline"
                className="w-full sm:w-auto mt-4 sm:mt-0 border-primary text-primary hover:bg-primary/10 active:scale-95 transition-transform duration-150 ease-in-out"
            >
              {isCopied ? <ClipboardCheck className="mr-2 h-5 w-5 text-green-500" /> : <ClipboardCopy className="mr-2 h-5 w-5" />}
              {isCopied ? 'Copied!' : 'Copy Commands'}
            </Button>
          )}
        </CardFooter>
      </form>

      {generatedCommands && (
        <div className="p-6 mt-6 border-t">
          <div className="flex items-center space-x-2 mb-4">
             <TerminalSquare className="h-6 w-6 text-primary" />
            <h3 className="font-headline text-xl font-semibold text-primary">Generated CLI Commands</h3>
          </div>
          <Textarea
            readOnly
            value={generatedCommands}
            rows={10}
            className="bg-muted/30 border-dashed font-code text-sm"
            aria-label="Generated Palo Alto CLI commands"
          />
        </div>
      )}
    </Card>
  );
}
