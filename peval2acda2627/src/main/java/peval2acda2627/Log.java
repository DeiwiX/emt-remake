package peval2acda2627;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

public class Log {

    private static final Path FICHERO = Path.of("errores.log");
    private static final DateTimeFormatter FORMATO = DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm:ss");

    public static void error(int linea, String motivo) {
        String texto = LocalDateTime.now().format(FORMATO) + " | línea " + linea + " | " + motivo
                + System.lineSeparator();
        try {
            Files.writeString(FICHERO, texto, StandardCharsets.UTF_8,
                    StandardOpenOption.CREATE, StandardOpenOption.APPEND);
        } catch (IOException e) {
            System.out.println("No se pudo escribir en errores.log: " + e.getMessage());
        }
    }
}
