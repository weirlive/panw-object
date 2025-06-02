
"use client";

import { useState, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { ClipboardCopy, ClipboardCheck, TerminalSquare, Settings2, Edit3, PlusSquare } from 'lucide-react';
import { useToast } from "@/hooks/use-toast";

type OperationType = 'rename' | 'create';

export default function PaloAltoForm() {
  const [baseName, setBaseName] = useState<string>('');
  const [tag, setTag] = useState<string>('');
  const [objectType, setObjectType] = useState<string>('HST');
  const [operationType, setOperationType] = useState<OperationType>('rename');
  const [objectListInput, setObjectListInput] = useState<string>('');
  const [generatedCommands, setGeneratedCommands] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isCopied, setIsCopied] = useState<boolean>(false);
  const { toast } = useToast();

  const handleGenerateCommands = (event: FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setGeneratedCommands('');

    if (!baseName.trim()) {
        toast({
            title: "Missing Base Name",
            description: "Please enter the Base Name.",
            variant: "destructive",
        });
        setIsLoading(false);
        return;
    }
    if (!tag.trim()) {
        toast({
            title: "Missing Tag",
            description: "Please enter the Tag.",
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

    lines.forEach(line => {
      const trimmedLine = line.trim();
      if (!trimmedLine) return;

      let valuePartForNewNameConstruction: string;
      let valuePartForObjectDefinition: string; // Only for 'create'
      let descriptionForNewObject: string;
      let originalObjectNameForRename: string | undefined = undefined;

      if (operationType === 'rename') {
        const lastUnderscoreIndex = trimmedLine.lastIndexOf('_');
        if (lastUnderscoreIndex === -1) {
          commandsArray.push(`# Skipping RENAME: Malformed entry (expected OriginalName_SuffixForNewName): ${trimmedLine}`);
          return;
        }
        originalObjectNameForRename = trimmedLine;
        valuePartForNewNameConstruction = trimmedLine.substring(lastUnderscoreIndex + 1);
        descriptionForNewObject = originalObjectNameForRename; 

        if (!valuePartForNewNameConstruction) {
          commandsArray.push(`# Skipping RENAME: Malformed entry (empty suffix part after underscore): ${trimmedLine}`);
          return;
        }
      } else { // operationType === 'create'
        valuePartForNewNameConstruction = trimmedLine;
        valuePartForObjectDefinition = trimmedLine; 
        descriptionForNewObject = trimmedLine; // Use the input value as description

        if (!valuePartForObjectDefinition.trim()) {
             commandsArray.push(`# Skipping CREATE: Empty value provided: ${trimmedLine}`);
             return;
        }
      }
      
      const sanitizedValuePart = valuePartForNewNameConstruction.replace(/\./g, '_').replace(/\//g, '_').replace(/-/g, '_');
      const newName = `${baseName}_${objectType}_${sanitizedValuePart}`;
      
      if (operationType === 'rename') {
        if (!originalObjectNameForRename) return; // Should be caught by earlier checks
        commandsArray.push(`rename address ${originalObjectNameForRename} to ${newName}`);
        commandsArray.push(`set address ${newName} description "${descriptionForNewObject}"`);
        commandsArray.push(`set address ${newName} tag [ ${tag} ]\n`);
      } else { // operationType === 'create'
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
        commandsArray.push(`set address ${newName} tag [ ${tag} ]\n`);
      }
    });

    setGeneratedCommands(commandsArray.join('\n'));
    setIsLoading(false);
    if (commandsArray.length > 0 && commandsArray.some(cmd => !cmd.startsWith('#'))) {
        toast({
            title: "Commands Generated",
            description: "Your Palo Alto CLI commands are ready.",
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

  const renamePlaceholder = 
`# Examples (OriginalObjectName_SuffixForNewName):
# MyServer_192.168.1.10
# CorpNet_10.10.0.0/16
# DMZServers_172.16.1.5-172.16.1.20
# GoogleDNS_google.com
#
# Paste one entry per line.
# The SuffixForNewName part is used to construct the new object name.

ProdServer_1.1.1.1
StagingNet_10.20.0.0/24
GuestRange_192.168.100.10-192.168.100.20
MainSite_main.example.com`;

  const createPlaceholder =
`# Examples (one actual value per line):
# 192.168.1.10
# 10.10.0.0/16
# 172.16.1.5-172.16.1.20
# google.com
#
# Paste one value per line.
# This value will be used for the object and its description.

1.1.1.1
10.20.0.0/24
192.168.100.10-192.168.100.20
main.example.com`;

  return (
    <Card className="w-full shadow-xl bg-card text-card-foreground">
      <CardHeader>
        <div className="flex items-center space-x-2 mb-2">
          <Settings2 className="h-6 w-6 text-primary" />
          <CardTitle className="font-headline text-2xl text-primary">Configuration</CardTitle>
        </div>
        <CardDescription className="text-card-foreground/80">
          Enter the details below to generate your Palo Alto CLI commands.
        </CardDescription>
      </CardHeader>
      <form onSubmit={handleGenerateCommands}>
        <CardContent className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label htmlFor="baseName" className="font-semibold text-card-foreground/90">Base Name</Label>
              <Input
                id="baseName"
                type="text"
                placeholder="e.g., ZONE-NAME"
                value={baseName}
                onChange={(e) => setBaseName(e.target.value)}
                required
                className="focus:ring-ring"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="tag" className="font-semibold text-card-foreground/90">Tag</Label>
              <Input
                id="tag"
                type="text"
                placeholder="e.g., CriticalServer"
                value={tag}
                onChange={(e) => setTag(e.target.value)}
                required
                className="focus:ring-ring"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="font-semibold text-card-foreground/90">Operation Type</Label>
              <RadioGroup
                value={operationType}
                onValueChange={(value) => setOperationType(value as OperationType)}
                className="flex flex-col space-y-2 pt-1 sm:flex-row sm:flex-wrap sm:space-y-0 sm:space-x-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="rename" id="op-rename" />
                  <Label htmlFor="op-rename" className="font-normal flex items-center">
                    <Edit3 className="mr-2 h-4 w-4 text-primary/80" /> Rename Existing
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="create" id="op-create" />
                  <Label htmlFor="op-create" className="font-normal flex items-center">
                    <PlusSquare className="mr-2 h-4 w-4 text-primary/80" /> Create New
                  </Label>
                </div>
              </RadioGroup>
            </div>
            <div className="space-y-2">
              <Label className="font-semibold text-card-foreground/90">Object Type</Label>
              <RadioGroup
                value={objectType}
                onValueChange={setObjectType}
                className="flex flex-col space-y-2 pt-1 sm:flex-row sm:flex-wrap sm:space-y-0 sm:space-x-4"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="HST" id="r-hst" />
                  <Label htmlFor="r-hst" className="font-normal">Host (HST)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="SBN" id="r-sbn" />
                  <Label htmlFor="r-sbn" className="font-normal">Subnet (SBN)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="ADR" id="r-adr" />
                  <Label htmlFor="r-adr" className="font-normal">Address Range (ADR)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="FQDN" id="r-fqdn" />
                  <Label htmlFor="r-fqdn" className="font-normal">FQDN</Label>
                </div>
              </RadioGroup>
            </div>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="objectList" className="font-semibold text-card-foreground/90">
              {operationType === 'rename' ? 'Object List (OriginalObjectName_SuffixForNewName)' : 'Object Values (One value per line)'}
            </Label>
            <Textarea
              id="objectList"
              placeholder={operationType === 'rename' ? renamePlaceholder : createPlaceholder}
              value={objectListInput}
              onChange={(e) => setObjectListInput(e.target.value)}
              required
              rows={8}
              className="focus:ring-ring font-code text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {operationType === 'rename' 
                ? "Format: `OriginalObjectName_SuffixForNewName` (e.g., OldServer_1.2.3.4). Suffix is used for new name."
                : "Format: Actual Value (e.g., 1.2.3.4, 10.0.0.0/16, example.com). Paste one value per line."
              }
              {' '}Value type depends on selected Object Type.
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

