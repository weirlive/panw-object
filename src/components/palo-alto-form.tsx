
"use client";

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Checkbox } from "@/components/ui/checkbox";
import { ClipboardCopy, ClipboardCheck, TerminalSquare, Settings2, FileSignature, FilePlus, ListPlus, Tag } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

type OperationType = 'create' | 'rename';

export default function PaloAltoForm() {
  const [baseName, setBaseName] = useState<string>('');
  const [tagValue, setTagValue] = useState<string>('');
  const [createTagForEntries, setCreateTagForEntries] = useState<boolean>(false);
  const [addressType, setAddressType] = useState<string>('AUTO');
  const [descriptionValue, setDescriptionValue] = useState<string>('');
  const [operationType, setOperationType] = useState<OperationType>('create');
  const [listInput, setListInput] = useState<string>('');
  const [generatedCommands, setGeneratedCommands] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const [addToGroup, setAddToGroup] = useState<boolean>(false);
  const [addressGroupSuffix, setAddressGroupSuffix] = useState<string>('');
  const [addressGroupTag, setAddressGroupTag] = useState<string>('');
  const [createTagForGroup, setCreateTagForGroup] = useState<boolean>(false);
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
    if (!listInput.trim()) {
        toast({
            title: "Missing List/Values",
            description: "Please paste your list or values.",
            variant: "destructive",
        });
        setIsLoading(false);
        return;
    }

    const commandsArray: string[] = [];
    const namesForGroup: string[] = [];
    const tagsToCreate = new Set<string>();
    
    const effectiveTag = tagValue.trim() || baseName.trim();
    const effectiveGroupTag = addressGroupTag.trim() || baseName.trim();

    if (tagValue.trim() && createTagForEntries) {
      tagsToCreate.add(tagValue.trim());
    }
    if (addToGroup && addressGroupTag.trim() && createTagForGroup) {
      tagsToCreate.add(addressGroupTag.trim());
    }

    if (tagsToCreate.size > 0) {
      commandsArray.push(`# Tag Creation Commands`);
      tagsToCreate.forEach(tag => {
        commandsArray.push(`set tag ${tag}`);
      });
      commandsArray.push(``); 
    }

    const lines = listInput.split('\n');

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      let valuePartForNewNameConstruction: string;
      let valuePartForDefinition: string = '';
      let descriptionForNewEntry: string;
      let originalNameForRename: string | undefined = undefined;
      let newName: string;
      let currentAddressType = addressType;

      if (operationType === 'create' && addressType === 'AUTO') {
        if (trimmedLine.includes('/')) {
          currentAddressType = 'SBN';
        } else {
          // Basic check if it looks like an IP, can be improved.
          // This regex is a simple check and might not cover all edge cases.
          const ipRegex = /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/;
          if(ipRegex.test(trimmedLine)) {
            currentAddressType = 'HST';
          } else {
             // If it's not a subnet and doesn't look like a plain IP, maybe it's an FQDN or range?
             // For now, let's treat it as a skip, or you could default to FQDN
             commandsArray.push(`# Skipping auto-detect for value: "${trimmedLine}". Not a clear Host/Subnet. Please select a specific type.`);
             return;
          }
        }
      }


      if (operationType === 'rename') {
        originalNameForRename = trimmedLine;
        valuePartForNewNameConstruction = trimmedLine;

        if (!originalNameForRename.trim()) {
          commandsArray.push(`# Skipping RENAME: Empty original name provided: ${trimmedLine}`);
          return;
        }
        
        const sanitizedSuffixForRename = valuePartForNewNameConstruction
          .replace(/[\/\s-]+/g, '_') 
          .replace(/[^a-zA-Z0-9_.]/g, '') 
          .replace(/_{2,}/g, '_') 
          .replace(/^_+|_+$/g, '');


        if (!sanitizedSuffixForRename) {
          commandsArray.push(`# Skipping RENAME: Resulting name part is empty after sanitization for original: ${trimmedLine}`);
          return;
        }
        newName = `${baseName.trim()}_${currentAddressType}_${sanitizedSuffixForRename}`;
        descriptionForNewEntry = descriptionValue.trim() || originalNameForRename;

      } else { // Create operation
        valuePartForNewNameConstruction = trimmedLine;
        valuePartForDefinition = trimmedLine;

        if (!valuePartForDefinition.trim()) {
             commandsArray.push(`# Skipping CREATE: Empty value provided: ${trimmedLine}`);
             return;
        }

        const formattedValuePart = valuePartForNewNameConstruction
          .replace(/[\/\s-]+/g, '_') 
          .replace(/[^a-zA-Z0-9_.]/g, '')
          .replace(/_{2,}/g, '_') 
          .replace(/^_+|_+$/g, '');


        if (!formattedValuePart) {
          commandsArray.push(`# Skipping CREATE: Resulting name part is empty after sanitization: ${trimmedLine} (derived from: ${valuePartForNewNameConstruction})`);
          return;
        }
        newName = `${baseName.trim()}_${currentAddressType}_${formattedValuePart}`;
        descriptionForNewEntry = descriptionValue.trim() || trimmedLine;
      }


      newName = newName.toUpperCase();


      if (operationType === 'rename') {
        if (!originalNameForRename) {
             commandsArray.push(`# Skipping RENAME: Could not determine original name for: ${trimmedLine}`);
             return;
        }
        commandsArray.push(`rename address ${originalNameForRename} to ${newName}`);
        commandsArray.push(`set address ${newName} description "${descriptionForNewEntry}"`);
        if (effectiveTag) {
            commandsArray.push(`set address ${newName} tag [ ${effectiveTag} ]\n`);
        } else {
            commandsArray.push(''); 
        }
        namesForGroup.push(newName);
      } else { // create
        switch (currentAddressType) {
          case 'HST':
            const hostIp = valuePartForDefinition.includes('/') ? valuePartForDefinition : `${valuePartForDefinition}/32`;
            commandsArray.push(`set address ${newName} ip-netmask ${hostIp}`);
            break;
          case 'SBN':
            commandsArray.push(`set address ${newName} ip-netmask ${valuePartForDefinition}`);
            break;
          case 'ADR':
            commandsArray.push(`set address ${newName} ip-range ${valuePartForDefinition}`);
            break;
          case 'FQDN':
            commandsArray.push(`set address ${newName} fqdn ${valuePartForDefinition}`);
            break;
        }
        commandsArray.push(`set address ${newName} description "${descriptionForNewEntry}"`);
        if (effectiveTag) {
            commandsArray.push(`set address ${newName} tag [ ${effectiveTag} ]\n`);
        } else {
            commandsArray.push(''); 
        }
        namesForGroup.push(newName);
      }
    });

    if (addToGroup && namesForGroup.length > 0) {
      const sanitizedGroupSuffix = addressGroupSuffix.trim().replace(/[.\/\s]+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');
      const groupNameBase = `${baseName.trim()}_ADG_`;
      const groupName = `${groupNameBase}${sanitizedGroupSuffix ? sanitizedGroupSuffix : ''}`.toUpperCase();
      
      commandsArray.push(`\n# Address Group Configuration`);
      commandsArray.push(`set address-group ${groupName} static [ ${namesForGroup.join(' ')} ]`);
      if (!addressGroupSuffix.trim()) {
        commandsArray.push(`set address-group ${groupName} description "Address group for ${baseName.trim().toUpperCase()}"`);
      } else {
        commandsArray.push(`set address-group ${groupName} description "${addressGroupSuffix.trim()}"`);
      }
      if (effectiveGroupTag) {
        commandsArray.push(`set address-group ${groupName} tag [ ${effectiveGroupTag} ]`);
      }
      commandsArray.push('');
    }

    setGeneratedCommands(commandsArray.join('\n'));
    setIsLoading(false);
    if (commandsArray.length > 0 && commandsArray.some(cmd => !cmd.startsWith('#'))) {
        toast({
            title: "Commands Generated",
            description: `Your CLI commands are ready.${addToGroup && namesForGroup.length > 0 ? ' Address group configured.' : ''}`,
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
            description: "The list might be empty or all entries were malformed/empty.",
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
`# Paste one original name per line.
# Example: MyExistingServer.internal.net
# The new name will be constructed as: ZoneName_Type_SanitizedOriginalName.
# Dots (.) in the original name (e.g., in IPs or FQDNs) will be PRESERVED in the SanitizedOriginalName part.
# Other special characters (slashes, spaces, hyphens) will be replaced with underscores.`;


  const createPlaceholder =
`# Paste one value per line. Example value types:
# Auto-detect: 192.168.1.10 (becomes Host) or 10.10.0.0/16 (becomes Subnet)
# Host (HST): 192.168.1.10
# Subnet (SBN): 10.10.0.0/16
# Address Range (ADR): 172.16.1.5-172.16.1.20
# FQDN: www.example.com
#
# Dots (.) in the value (e.g., in IPs or FQDNs) are preserved in the name suffix.
# Other special characters (slashes, spaces, hyphens) become underscores.
# New name: ZoneName_Type_SanitizedValue

1.1.1.1
10.20.0.0/24
main.example.com`;

  const getPlaceholder = () => {
    if (operationType === 'rename') {
      return renamePlaceholderBase;
    }
    return createPlaceholder;
  }

  const displaySanitizedSuffix = addressGroupSuffix.trim().replace(/[.\/\s]+/g, '_').replace(/[^a-zA-Z0-9_-]/g, '');

  const sanitizeExampleSuffix = (input: string) => {
    return input
      .replace(/[\/\s-]+/g, '_') 
      .replace(/[^a-zA-Z0-9_.]/g, '') 
      .replace(/_{2,}/g, '_') 
      .replace(/^_+|_+$/g, '') 
      .toUpperCase();
  };

  const liveZoneNamePart = (baseName.trim() || "[ZoneName]").toUpperCase();
  let liveTypePart = addressType.toUpperCase();
  let exampleInputForSuffixHint = "";
  let liveExampleSuffix = "";

  if (operationType === 'create') {
    switch (addressType) {
      case 'AUTO':
        liveTypePart = 'HST'; // Default example to HST for auto
        exampleInputForSuffixHint = "192.168.1.1";
        break;
      case 'HST':
        exampleInputForSuffixHint = "192.168.1.1";
        break;
      case 'SBN':
        exampleInputForSuffixHint = "10.0.0.0/16";
        break;
      case 'ADR':
        exampleInputForSuffixHint = "1.1.1.5-1.1.1.10";
        break;
      case 'FQDN':
        exampleInputForSuffixHint = "site.example.com";
        break;
      default:
        exampleInputForSuffixHint = "example-value";
    }
    liveExampleSuffix = sanitizeExampleSuffix(exampleInputForSuffixHint);
  } else { // rename
    exampleInputForSuffixHint = "Original.Name-Example";
    liveExampleSuffix = sanitizeExampleSuffix(exampleInputForSuffixHint);
  }
  if (!liveExampleSuffix && exampleInputForSuffixHint) liveExampleSuffix = "[SANITIZED]";


  const liveExampleName = `${liveZoneNamePart}_${liveTypePart}_${liveExampleSuffix || "[Suffix]"}`;
  const lines = listInput.split('\n');


  return (
    <Card className="w-full shadow-xl bg-card text-card-foreground">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Settings2 className="h-6 w-6 text-primary" />
            <CardTitle className="font-headline text-2xl text-primary">Configuration</CardTitle>
          </div>
          <RadioGroup
            value={operationType}
            onValueChange={(value) => {
              setOperationType(value as OperationType);
              setGeneratedCommands(''); 
            }}
            className="flex space-x-4"
          >
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="create" id="r_create" />
              <Label htmlFor="r_create" className="flex items-center text-sm">
                <FilePlus className="mr-2 h-4 w-4 text-primary/80" /> Create
              </Label>
            </div>
            <div className="flex items-center space-x-2">
              <RadioGroupItem value="rename" id="r_rename" />
              <Label htmlFor="r_rename" className="flex items-center text-sm">
                <FileSignature className="mr-2 h-4 w-4 text-primary/80" /> Rename
              </Label>
            </div>
          </RadioGroup>
        </div>
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
              <Label htmlFor="tagValue" className="font-semibold text-card-foreground/90">Tag (Optional)</Label>
              <Input
                id="tagValue"
                type="text"
                placeholder="e.g., CriticalServer"
                value={tagValue}
                onChange={(e) => setTagValue(e.target.value)}
                className="focus:ring-ring"
              />
              <div className="flex items-center space-x-2 pt-1">
                <Checkbox 
                  id="createTagForEntries" 
                  checked={createTagForEntries} 
                  onCheckedChange={(checked) => setCreateTagForEntries(checked === true)} 
                  disabled={!tagValue.trim()}
                />
                <Label htmlFor="createTagForEntries" className="text-xs font-normal text-muted-foreground">
                  Create this tag if it doesn't exist
                </Label>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
                <Label htmlFor="addressType" className="font-semibold text-card-foreground/90">Type</Label>
                <Select value={addressType} onValueChange={setAddressType}>
                  <SelectTrigger id="addressType" className="w-full focus:ring-ring">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTO">Auto-detect (Host/Subnet)</SelectItem>
                    <SelectItem value="HST">Host (HST)</SelectItem>
                    <SelectItem value="SBN">Subnet (SBN)</SelectItem>
                    <SelectItem value="ADR">Address Range (ADR)</SelectItem>
                    <SelectItem value="FQDN">FQDN</SelectItem>
                  </SelectContent>
                </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="descriptionValue" className="font-semibold text-card-foreground/90">
                Description (Optional)
              </Label>
              <Input
                id="descriptionValue"
                type="text"
                placeholder="e.g., Primary Web Server"
                value={descriptionValue}
                onChange={(e) => setDescriptionValue(e.target.value)}
                className="focus:ring-ring"
              />
            </div>
          </div>
           <div className="mt-1 space-y-1 pl-1">
            <p className="text-xs text-muted-foreground">
              Example: <strong className="text-card-foreground/90 font-code">{liveExampleName}</strong>
            </p>
            <p className="text-xs text-muted-foreground italic">
              (Using "{exampleInputForSuffixHint}" as an example {operationType === 'create' ? 'input value' : 'original name'} for the suffix part)
            </p>
          </div>


          <div className="space-y-2 pt-4">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="addToGroup"
                checked={addToGroup}
                onCheckedChange={(checked: boolean | 'indeterminate') => setAddToGroup(checked === true)}
              />
              <Label htmlFor="addToGroup" className="font-semibold text-card-foreground/90 flex items-center">
                <ListPlus className="mr-2 h-5 w-5 text-primary/80" />
                Add to an Address Group
              </Label>
            </div>
          </div>

          {addToGroup && (
            <div className="space-y-4 pl-7">
              <div className="space-y-2">
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
                  Final group name: <span className="font-code">{`${(baseName.trim() || "[ZoneName]").toUpperCase()}_ADG_${(displaySanitizedSuffix).toUpperCase()}`}</span>{!displaySanitizedSuffix && <span className="italic">(NO SUFFIX)</span>}
                </p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="addressGroupTag" className="font-semibold text-card-foreground/90">
                  Address Group Tag (Optional)
                </Label>
                <Input
                  id="addressGroupTag"
                  type="text"
                  placeholder="e.g., DepartmentTag"
                  value={addressGroupTag}
                  onChange={(e) => setAddressGroupTag(e.target.value)}
                  className="focus:ring-ring"
                />
                <div className="flex items-center space-x-2 pt-1">
                  <Checkbox 
                    id="createTagForGroup" 
                    checked={createTagForGroup} 
                    onCheckedChange={(checked) => setCreateTagForGroup(checked === true)} 
                    disabled={!addressGroupTag.trim()}
                  />
                  <Label htmlFor="createTagForGroup" className="text-xs font-normal text-muted-foreground">
                    Create this tag if it doesn't exist
                  </Label>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <Label htmlFor="listInput" className="font-semibold text-card-foreground/90">
              {operationType === 'rename'
                ? 'List (Original Name, one per line)'
                : 'Values (One value per line)'
              }
            </Label>
            <Textarea
              id="listInput"
              placeholder={getPlaceholder()}
              value={listInput}
              onChange={(e) => setListInput(e.target.value)}
              required
              rows={8}
              className="focus:ring-ring font-code text-sm"
            />
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

    