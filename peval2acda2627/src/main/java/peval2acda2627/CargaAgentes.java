package peval2acda2627;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.StringReader;
import java.nio.ByteBuffer;
import java.nio.charset.CharacterCodingException;
import java.nio.charset.CodingErrorAction;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.Connection;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.LocalDate;
import java.time.format.ResolverStyle;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.HashSet;
import java.util.Set;

public class CargaAgentes {

    private static final Path FICHERO = Path.of("agentes.csv");
    private static final DateTimeFormatter FECHA =
            DateTimeFormatter.ofPattern("dd/MM/uuuu").withResolverStyle(ResolverStyle.STRICT);
    private static final Set<String> RANGOS =
            Set.of("AGENTE", "CABO", "SUBINSPECTOR", "INSPECTOR", "COMISARIO");

    public static void cargar(Connection con) {
        String contenido;
        try {
            contenido = leer(FICHERO);
        } catch (IOException e) {
            System.out.println("No se pudo leer " + FICHERO + ": " + e.getMessage());
            return;
        }

        int insertados = 0;
        int errores = 0;
        Set<String> cargadas = new HashSet<>();
        try (BufferedReader br = new BufferedReader(new StringReader(contenido))) {
            String linea;
            int n = 0;
            while ((linea = br.readLine()) != null) {
                n++;
                if (linea.isBlank()) {
                    continue;
                }
                String motivo = procesar(con, linea, cargadas);
                if (motivo == null) {
                    insertados++;
                } else {
                    errores++;
                    Log.error(n, motivo);
                }
            }
        } catch (IOException e) {
            System.out.println("Error leyendo el fichero: " + e.getMessage());
        }
        System.out.println("Carga finalizada: " + insertados + " agentes insertados, " + errores
                + " errores (ver errores.log)");
    }

    /** Devuelve null si el agente se insertó, o el motivo del error. */
    private static String procesar(Connection con, String linea, Set<String> cargadas) {
        String[] c = linea.split(";", -1);
        if (c.length != 5) {
            return "número de campos incorrecto (" + c.length + ", se esperaban 5)";
        }
        String placa = c[0].trim();
        String nombre = c[1].trim();
        String rango = c[2].trim().toUpperCase();
        String idTexto = c[3].trim();
        String fechaTexto = c[4].trim();

        if (placa.isEmpty()) {
            return "placa vacía";
        }
        if (placa.length() > 10) {
            return "placa demasiado larga (máximo 10 caracteres): " + placa;
        }
        if (nombre.isEmpty()) {
            return "nombre vacío (placa " + placa + ")";
        }
        if (nombre.length() > 60) {
            return "nombre demasiado largo (máximo 60 caracteres)";
        }
        if (!RANGOS.contains(rango)) {
            return "rango no válido '" + c[2].trim() + "' (placa " + placa + ")";
        }
        int idComisaria;
        try {
            idComisaria = Integer.parseInt(idTexto);
        } catch (NumberFormatException e) {
            return "id de comisaría no numérico '" + idTexto + "' (placa " + placa + ")";
        }
        LocalDate fecha;
        try {
            fecha = LocalDate.parse(fechaTexto, FECHA);
        } catch (DateTimeParseException e) {
            return "fecha de ingreso no válida '" + fechaTexto + "' (placa " + placa + ")";
        }
        if (fecha.isAfter(LocalDate.now())) {
            return "fecha de ingreso posterior a hoy: " + fechaTexto + " (placa " + placa + ")";
        }
        if (cargadas.contains(placa)) {
            return "placa duplicada en el fichero: " + placa;
        }

        try {
            if (existe(con, "SELECT 1 FROM agentes WHERE placa = ?", placa)) {
                return "la placa " + placa + " ya existe en la base de datos";
            }
            if (!existe(con, "SELECT 1 FROM comisarias WHERE id = ?", idComisaria)) {
                return "la comisaría " + idComisaria + " no existe (placa " + placa + ")";
            }
            try (PreparedStatement ps = con.prepareStatement(
                    "INSERT INTO agentes (placa, nombre, rango, id_comisaria, fecha_ingreso) VALUES (?,?,?,?,?)")) {
                ps.setString(1, placa);
                ps.setString(2, nombre);
                ps.setString(3, rango);
                ps.setInt(4, idComisaria);
                ps.setDate(5, Date.valueOf(fecha));
                ps.executeUpdate();
            }
        } catch (SQLException e) {
            return "error de base de datos (placa " + placa + "): " + e.getMessage();
        }
        cargadas.add(placa);
        return null;
    }

    private static boolean existe(Connection con, String sql, Object valor) throws SQLException {
        try (PreparedStatement ps = con.prepareStatement(sql)) {
            ps.setObject(1, valor);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next();
            }
        }
    }

    /** Lee en UTF-8 y, si el fichero no lo es (p. ej. guardado desde Excel), en Windows-1252. */
    private static String leer(Path fichero) throws IOException {
        byte[] bytes = Files.readAllBytes(fichero);
        try {
            return StandardCharsets.UTF_8.newDecoder()
                    .onMalformedInput(CodingErrorAction.REPORT)
                    .onUnmappableCharacter(CodingErrorAction.REPORT)
                    .decode(ByteBuffer.wrap(bytes)).toString();
        } catch (CharacterCodingException e) {
            return new String(bytes, java.nio.charset.Charset.forName("windows-1252"));
        }
    }
}
