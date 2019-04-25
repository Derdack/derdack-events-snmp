# Meaningful Parameter Names in SNMP Events

Enterprise Alert offers the possibility to directly receive SNMP traps and generate alarms from them.

The SNMP traps contain a number of parameters that are identified by OIDs. These OIDs are quite cryptic and not very meaningful.

![SNMP Event](ea-snmp-event.png)

So-called MIB files are used to assign meaningful names to the OIDs.

Example:

OID: 1.3.6.1.4.1.39165.1.5 -> Label: DeviceID

The following describes how you can use a script to import such MIB files to display meaningful names instead of OIDs in SNMP events. You can also use these names in alert policies.

The procedure is as follows:

**Convert the MIB files into XML**  
For this we use the MIB Importer of the company Paessler: https://www.de.paessler.com/tools/mibimporter

This tool parses one or more MIB files (File -> Import MIB file). If these were successfully recognized, you can create a so-called OIDLIB (File -> Save OIDlib as ...). This is an XML file to which you should add the extension .xml afterwards. This tool automatically adds standard OIDs and their names.

Once you have created this XML file, copy it to your Enterprise Alert Server into the directory C:\Program Files\Enterprise Alert\SNMPConnector\MIB\XML\. You can also customize this path in the JavaScript SNMP-MIB-Importer3.js.

**Import into Enterprise Alert**  
In GitHub at https://github.com/derdack/derdack-events-snmp we have provided the JavaScript SNMP-MIB-Importer.js. Please also copy this script to your Enterprise Alert Server in the above directory. Please adjust the variable STRING_DB_CONNECTION in the script so that it contains the connection string to your Enterprise Alert database. Now you can execute the script.

Done. Now the parameter names in the SNMP event should contain meaningful names.
