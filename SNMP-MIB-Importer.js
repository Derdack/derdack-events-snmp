/*
This script reads MIB files (converted into XML) from a given path (STRING_MIB_FOLDER). 

Please do not use sub folders, and other files than XML files in this special folder. 
For converting MIB text files into XML files we recommend using the Paessler MIB Importer.
If you use other tools you may have to adapt the STRING_DESCRIPTOR_... variables.

For further support contact us at support@de.derdack.com

v1.0.0 (02.08.2018, Frank Gutacker)

Copyright 2018 Derdack GmbH, www.derdack.com, Enterprise Alert is a registered trademark of Derdack GmbH
*/

var INT_MAX_ERROR_COUNT				= 5;

var STRING_DB_CONNECTION 			= "Driver=SQL Server Native Client 11.0;Server=.\\sqlexpress;Trusted_Connection=Yes;Database=EnterpriseAlert"; // DB connect string
var STRING_MIB_FOLDER 				= ".\\";

var STRING_DESCRIPTOR_ENTRY			= "entry"
var STRING_DESCRIPTOR_OID			= "OriginalOID"
var STRING_DESCRIPTOR_LABEL			= "OriginalLabel"
var STRING_DESCRIPTOR_DESCRIPTION 	= "description"

var oXml 	= new ActiveXObject("Microsoft.XMLDOM");
var oFs 	= new ActiveXObject("Scripting.FileSystemObject");
var oDb 	= new ActiveXObject("ADODB.Connection");

var iErrorCount = 0;

// Reads content of XML file, and transforms OID, label, and description entries into object
function processFile(sFile) {
	WScript.echo("-- Scanning " + sFile);
	
	var aRes = [];

	var sContent = FS.file2string(sFile);
	
	// Remove BOM
	var iLtIndex = sContent.indexOf("<");
	if (iLtIndex > 0) {
		sContent = sContent.substr(iLtIndex);
	} else if (iLtIndex == -1) {
		throw("No XML file: " + sFile);
	}
	
	oXml.loadXML(sContent);
	
	var aOid = [];
	var aName = [];
	var aDescription = [];
	
	for (var i = 0; i <= oXml.selectNodes("//" + STRING_DESCRIPTOR_ENTRY + "//" + STRING_DESCRIPTOR_OID).length; i++) {

		aOid[i] = oXml.selectNodes("//" + STRING_DESCRIPTOR_ENTRY + "//" + STRING_DESCRIPTOR_OID + "[" + i + "]/text()")[0].nodeValue;
		aName[i] = oXml.selectNodes("//" + STRING_DESCRIPTOR_ENTRY + "//" + STRING_DESCRIPTOR_LABEL + "[" + i + "]/text()")[0].nodeValue;

		// Description might be empty
		var node = null;
		node = oXml.selectNodes("//" + STRING_DESCRIPTOR_ENTRY + "//" + STRING_DESCRIPTOR_DESCRIPTION + "[" + i + "]/text()")[0];
		if (node == null) {
			aDescription[i] = "";
		}
		else {
			aDescription[i] = node.nodeValue;
		}
	}
	
	if (aOid.length != aName.length || aName.length != aDescription.length) {
		throw("Different entries of OIDs, names, and descriptions detected. Please check content of " + sFile + "!");
	}
	
	for (var i = 0; i < aOid.length; i++) {
		var sOid = aOid[i].replace(/\s*/g, "");
		aRes[i] = {
			"id"			: sOid,
			"name"			: aName[i].replace(/\s*/g, ""),
			"description"	: aDescription[i].replace(/["'\t\r\n]/g, "").replace(/^[ ]*/g, "").replace(/[ ]*$/g, "").substr(0, 255)
		}
	}
	
	return aRes;
}

// Fetch files from STRING_MIB_FOLDER
function main() {
	var aFiles = FS.readFolder(STRING_MIB_FOLDER);
	
	for (var i = 0; i < aFiles.length; i++) {
		var aInfo = processFile(aFiles[i]);
		DB.saveMibs(aInfo);
	}
}

// Database helper
var DB = { 
	close: function() {
		try {
			oDb.Close();
		} catch(e) {
			// noop
		}	
	},
	
	// Read SNMP provider ID
	getSnmpProviderId: function() {
		var iId = -1;
		
		DB.open();
		var oRes = oDb.Execute("SELECT TOP 1 id FROM EventProviders WHERE Name='SnmpConnector'");
		if (!oRes.EOF) {
			iId = oRes.Fields.Item("id").Value 
		}
		DB.close();

		return iId;
	},
	
	open: function() {
		DB.close();
		try {
			oDb.Open(STRING_DB_CONNECTION);
		} catch(e) {
			if (iErrorCount++ < INT_MAX_ERROR_COUNT) {
				WScript.echo("!!! Database not reachable. Trying again in 30 seconds. !!!");
				sleep(30);
				DB.open();
			} else {
				WScript.echo("DB.open (max. error count reached (" + INT_MAX_ERROR_COUNT + ")). Stopping execution.");
				throw(e);
			}
		}
	},
	
	// Save MIB object data into Enterprise Alert database
	saveMibs: function(aMibs) {
		var iProviderId = DB.getSnmpProviderId();
		if (iProviderId < 1) {
			return false;
		}
		
		var iUpdated = 0;
		var iSaved = 0
		
		DB.open();
		for (var i = 0; i < aMibs.length; i++) {
			var bHasChanged = false;
			var sDisplayName = "";
			var sDescription = "";
			
			// Read existing database entry
			var oRes = oDb.Execute("SELECT DisplayName, Description FROM EventParameters WHERE ProviderId=" + iProviderId + " AND Name='" + aMibs[i].id + "'");
			if (!oRes.EOF) {
				sDisplayName = oRes.Fields.Item("DisplayName").Value;
				sDescription = oRes.Fields.Item("Description").Value;
			}
			
			// New entry? -> INSERT
			if (sDisplayName == "" && sDescription == "") {
				sSql = "INSERT INTO EventParameters (ProviderId, Name, DisplayName, XPath, Description, Options, ForbiddenEvaluations) values(" + iProviderId + ", '" + aMibs[i].id + "', '" + aMibs[i].name + "', '', '" + aMibs[i].description + "', 0, 0)";				
				if (oDb.Execute(sSql)) {
					iSaved++;
					bHasChanged = true;
				}
				
			// Existing entry? -> UPDATE
			} else if (sDisplayName != aMibs[i].name || sDescription != aMibs[i].description) {
				sSql = "UPDATE EventParameters SET ProviderId=" + iProviderId + ", DisplayName='" + aMibs[i].name + "', XPath='', Description='" + aMibs[i].description + "', Options=0, ForbiddenEvaluations=0 WHERE Name='" + aMibs[i].id + "'";
				if (oDb.Execute(sSql)) {
					iUpdated++;
					bHasChanged = true;
				}
			}
			
			// If inserted or updated -> WScript.echo output
			if (bHasChanged) {
				WScript.echo(aMibs[i].id + " = " + aMibs[i].name + " (" + aMibs[i].description + ")");
			}
		}
		
		WScript.echo((aMibs.length ? aMibs.length : 0) + " tuples, " + iUpdated + " updated, " + iSaved + " saved");
		
		DB.close();
	}
}

var FS = {
	// Transfer file content into one string (lines separated by line break).
	file2string: function(sFile) {
		var sRes = "";

		try {
			var oFileHandler = oFs.OpenTextFile(sFile, 1);

			for (var i = 0; !oFileHandler.AtEndOfStream; i++) {
				sRes += oFileHandler.ReadLine() + "\n";
			}

			oFileHandler.Close();
		} catch (e) {
			if (oFileHandler) { 
				oFileHandler.Close(); 
			}
			WScript.echo("FS.file2string() error message: " + (e.message ? e.message : e));
		}
		
		return sRes;
	},
	
	// Transfer file content into array of lines
	readFile: function(sFile) {
		var aRes = [];

		try {
			var oFileHandler = oFs.OpenTextFile(sFile, 1);

			for (var i = 0; !oFileHandler.AtEndOfStream; i++) {
				aRes[i] = oFileHandler.ReadLine();
			}

			oFileHandler.Close();
		} catch (e) {
			if (oFileHandler) { 
				oFileHandler.Close(); 
			}
			WScript.echo("FS.readFile() error message: " + (e.message ? e.message : e));
		}
			
		return aRes;
	},
	
	// Return folder content as array
	readFolder: function(sFolder) {
		var aRes = []
		
		try {
			var oDirHandler = oFs.GetFolder(sFolder);
			var oFiles 		= oDirHandler.Files;
			
			WScript.echo(oFiles.Count + " file" + (oFiles.Count > 1 ? "s" : "") + " found");
			
			for (var oEnum = new Enumerator(oFiles), i = 0; !oEnum.atEnd(); oEnum.moveNext(), i++) {
				aRes[i] = oEnum.item().Path;
			}
		} catch (e) {
			if (oDirHandler) { 
				oDirHandler.Close(); 
			}
			WScript.echo("FS.readFolder() error");
		}
			
		return aRes;
	}
}

// Trigger main method
main();
